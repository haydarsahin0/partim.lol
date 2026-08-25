/**
 * stripe-webhook — ödeme tamamlandığında hakkı hesaba işler.
 *
 * Koltuk devri ve abonelikler yalnızca sunucu tarafında verilir; istemci
 * hiçbir koşulda kendini başkan yapamaz ya da kendine abonelik açamaz.
 *
 * ÖNEMLİ: Abonelikler artık İKİ olaydan da işleniyor —
 * `checkout.session.completed` (ilk ödeme) ve `invoice.paid` (yenilemeler).
 * Önceden yalnızca `invoice.paid` dinleniyordu ve `checkout.session.completed`
 * abonelik modunda bilerek atlanıyordu; Stripe uç noktasında `invoice.paid`
 * seçili değilse ödeme alınıyor ama hak hiç gelmiyordu. Uygulama işlemleri
 * tekrara dayanıklı olduğu için ikisinin de gelmesi zararsız.
 *
 * Kurulum:
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 *   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
 */
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import {
  donemSonu,
  faturaAboneligi,
  hizliOyUygula,
  musteriKimligi,
  oturumuUygula,
  partiUygula,
  sahibiBul,
} from "../_shared/applyCheckout.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

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

  /* ------------------------- ödeme tamamlandı ---------------------------- */
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const sonuc = await oturumuUygula(stripe, admin, session);
    if (!sonuc.ok) {
      // Veritabanı hatasında 500 dön: Stripe tekrar dener, geçici arıza düzelir.
      // Eksik/yanlış bilgide 200 dön: tekrar denemek durumu değiştirmez.
      console.error("checkout.session.completed uygulanamadı", { id: session.id, sonuc });
      if (sonuc.message && /permission|connection|timeout|deadlock/i.test(sonuc.message)) {
        return new Response(sonuc.message, { status: 500 });
      }
    }
    return ok({ received: true, result: sonuc });
  }

  /* --------------------------- yenilemeler ------------------------------- */
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = faturaAboneligi(invoice);
    if (!subscriptionId) return ok({ received: true, ignored: "abonelik yok" });

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const meta = (subscription.metadata ?? {}) as Record<string, string>;

    if (meta.kind === "fast_votes") {
      const musteri = musteriKimligi(subscription);
      // Metadata kaybolsa bile yenileme sahibine bağlansın.
      const sahip = await sahibiBul(stripe, admin, meta, musteri);
      if (!sahip) {
        console.error("Yenilemenin sahibi bulunamadı", { subscriptionId });
        return ok({ received: true, ignored: "sahip yok" });
      }
      const sonuc = await hizliOyUygula(
        admin,
        subscriptionId,
        sahip,
        donemSonu(subscription, 1),
        musteri,
      );
      if (!sonuc.ok) {
        console.error("apply_fast_votes_subscription hatası", sonuc);
        return new Response(sonuc.message ?? "hata", { status: 500 });
      }
      return ok({ received: true, result: sonuc });
    }

    if (meta.kind === "custom_party") {
      // İlk ödemede logo, Checkout oturumuna bağlı geçici satırda duruyor.
      let logoUrl: string | null = null;
      const sessionId = typeof invoice.checkout === "string" ? invoice.checkout : null;
      if (sessionId) {
        const { data: pending } = await admin
          .from("pending_party_logos")
          .select("logo_url")
          .eq("session_id", sessionId)
          .maybeSingle();
        logoUrl = (pending?.logo_url as string | undefined) ?? null;
        if (logoUrl) await admin.from("pending_party_logos").delete().eq("session_id", sessionId);
      }
      const sonuc = await partiUygula(
        admin,
        subscriptionId,
        meta,
        donemSonu(subscription, 7),
        logoUrl,
      );
      if (!sonuc.ok) {
        console.error("apply_party_subscription hatası", sonuc);
        return new Response(sonuc.message ?? "hata", { status: 500 });
      }
      return ok({ received: true, result: sonuc });
    }

    return ok({ received: true, ignored: "bilinmeyen abonelik" });
  }

  /* ----------------------------- iptaller -------------------------------- */
  /* --------------------- iptal işaretlendi / geri alındı ------------------
   * Kullanıcı aboneliği ister uygulamadan ister Stripe'ın kendi sayfasından
   * iptal edebiliyor. İkincisinde uygulamanın haberi olmazdı: arayüz "yarın
   * yenilenir" demeye devam ederdi. Bu olay ikisini de yakalıyor.
   */
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    if ((subscription.metadata ?? {}).kind !== "fast_votes") {
      return ok({ received: true, ignored: "hızlı oy aboneliği değil" });
    }
    const bitis = subscription.cancel_at_period_end ? donemSonu(subscription, 1) : null;
    const { error } = await admin.rpc("set_fast_votes_cancel", {
      p_subscription_id: subscription.id,
      p_cancel_at: bitis,
    });
    if (error) {
      // Hak burada verilmiyor/alınmıyor; yalnızca arayüzdeki işaret. Stripe'ı
      // tekrar denemeye zorlamaya değmez, ama sessiz de kalmasın.
      console.error("set_fast_votes_cancel hatası", error);
    }
    return ok({ received: true, cancelAt: bitis });
  }

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
    return ok({ received: true });
  }

  return ok({ received: true });
});
