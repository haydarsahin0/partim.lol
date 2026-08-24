/**
 * stripe-webhook — ödeme tamamlandığında koltuğu devreder.
 *
 * Koltuk devri yalnızca burada olur; istemci hiçbir koşulda kendini başkan yapamaz.
 * apply_seat_purchase aynı Stripe oturumunu iki kez işlemez, dolayısıyla Stripe'ın
 * tekrar eden webhook denemeleri güvenlidir.
 *
 * Kurulum:
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 *   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
 */
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !secret) return new Response("İmza yok.", { status: 400 });

  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (err) {
    return new Response(`İmza doğrulanamadı: ${err instanceof Error ? err.message : err}`, {
      status: 400,
    });
  }

  // Haftalık parti aboneliği: ilk ödeme ve her yenileme partiyi uzatır.
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId =
      typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
    if (!subscriptionId) {
      return new Response(JSON.stringify({ received: true, ignored: "abonelik yok" }), { status: 200 });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const meta = subscription.metadata ?? {};

    // Hızlı oy: her günlük yenileme hakkı bir gün daha uzatır.
    if (meta.kind === "fast_votes") {
      const periodEnd = new Date((subscription.current_period_end ?? 0) * 1000).toISOString();
      const { data, error } = await admin.rpc("apply_fast_votes_subscription", {
        p_subscription_id: subscriptionId,
        p_user_id: meta.user_id,
        p_period_end: periodEnd,
      });
      if (error) {
        console.error("apply_fast_votes_subscription hatası", error);
        return new Response(error.message, { status: 500 });
      }
      return new Response(JSON.stringify({ received: true, result: data }), { status: 200 });
    }

    if (meta.kind !== "custom_party") {
      return new Response(JSON.stringify({ received: true, ignored: "parti aboneliği değil" }), {
        status: 200,
      });
    }

    // İlk ödemede logo, Checkout oturumuna bağlı geçici satırda duruyor.
    let logoUrl: string | null = null;
    const sessionId = typeof invoice.checkout === "string" ? invoice.checkout : null;
    if (sessionId) {
      const { data: pending } = await admin
        .from("pending_party_logos")
        .select("logo_url")
        .eq("session_id", sessionId)
        .maybeSingle();
      logoUrl = pending?.logo_url ?? null;
      if (logoUrl) await admin.from("pending_party_logos").delete().eq("session_id", sessionId);
    }

    const periodEnd = new Date((subscription.current_period_end ?? 0) * 1000).toISOString();
    const { data, error } = await admin.rpc("apply_party_subscription", {
      p_subscription_id: subscriptionId,
      p_user_id: meta.user_id,
      p_name: meta.party_name,
      p_short_name: meta.party_short,
      p_color: meta.party_color,
      p_logo_url: logoUrl,
      p_period_end: periodEnd,
    });
    if (error) {
      console.error("apply_party_subscription hatası", error);
      return new Response(error.message, { status: 500 });
    }
    return new Response(JSON.stringify({ received: true, result: data }), { status: 200 });
  }

  // Abonelik bitti: hızlı oy hakkını hemen kapat. (Kapatılmasa da yenileme
  // gelmediği an süre kendiliğinden dolar; bu, iptalin anında görünmesi için.)
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    if ((subscription.metadata ?? {}).kind === "fast_votes") {
      const { error } = await admin.rpc("cancel_fast_votes_subscription", {
        p_subscription_id: subscription.id,
      });
      if (error) {
        console.error("cancel_fast_votes_subscription hatası", error);
        return new Response(error.message, { status: 500 });
      }
    }
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  // Parti abonelikleri invoice.paid ile işlenir; burada karışmasın.
  if (
    session.mode === "subscription" ||
    session.metadata?.kind === "custom_party" ||
    session.metadata?.kind === "fast_votes"
  ) {
    return new Response(JSON.stringify({ received: true, ignored: "abonelik" }), { status: 200 });
  }
  if (session.payment_status !== "paid") {
    return new Response(JSON.stringify({ received: true, ignored: "ödenmemiş" }), { status: 200 });
  }

  const meta = session.metadata ?? {};
  const userId = meta.user_id ?? session.client_reference_id;
  const provinceId = meta.province_id;
  const partyId = meta.party_id;
  const amount = (session.amount_total ?? 0) / 100;

  if (!userId || !provinceId || !partyId || amount <= 0) {
    // Bilgi eksikse Stripe'a 200 dön: tekrar denemek durumu düzeltmez.
    console.error("Eksik metadata", { id: session.id, meta });
    return new Response(JSON.stringify({ received: true, ignored: "eksik metadata" }), {
      status: 200,
    });
  }

  const { data, error } = await admin.rpc("apply_seat_purchase", {
    p_session_id: session.id,
    p_user_id: userId,
    p_province_id: provinceId,
    p_party_id: partyId,
    p_amount: amount,
  });

  if (error) {
    console.error("apply_seat_purchase hatası", error);
    // 500 dönersek Stripe tekrar dener — geçici bir veritabanı hatasında istediğimiz bu.
    return new Response(error.message, { status: 500 });
  }

  // ok=false ise ödeme alındı ama koltuk kapılmış: 'stale' kaydı iade için beklemede.
  return new Response(JSON.stringify({ received: true, result: data }), { status: 200 });
});
