/**
 * create-fast-votes-subscription — oy bekleme süresini 15 saniyeye indiren
 * günlük Stripe aboneliğini başlatır.
 *
 * Hak burada verilmez: gerçek kayıt stripe-webhook fonksiyonunda,
 * apply_fast_votes_subscription() ile yapılır. Burada yalnızca kimlik
 * doğrulaması ve Checkout oturumu var — istemci kendi bekleme süresini
 * kısaltamaz.
 *
 * Gizli anahtar: STRIPE_SECRET_KEY
 */
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

/** Günlük ücret. Arayüzde yazmıyor; kullanıcı Stripe sayfasında görüyor. */
const DAILY_PRICE_USD = 2;
const COOLDOWN_SECONDS = 15;

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Yalnızca POST." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Giriş gerekli." }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ error: "Giriş gerekli." }, 401);

  // Oyun verisi auth kimliğine değil profil kimliğine bağlı (bkz. cihaz
  // hesapları göçü): metadata'ya profil kimliği yazılmalı.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id,fast_votes_until")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const profileId = profileRow?.id as string | undefined;
  if (!profileId) return json({ error: "Hesap bulunamadı." }, 401);

  const mevcut = profileRow?.fast_votes_until as string | null | undefined;
  if (mevcut && Date.parse(mevcut) > Date.now()) {
    return json({ error: "Hızlı oy aboneliğin zaten sürüyor." }, 409);
  }

  let body: { successUrl?: string; cancelUrl?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }
  if (!body.successUrl || !body.cancelUrl) return json({ error: "Eksik alan." }, 400);

  // Stripe hatası (eksik/yanlış anahtar, hesap doğrulanmamış, para birimi
  // kapalı...) yakalanmazsa istemciye 500 döner ve supabase-js bunu "non-2xx"
  // diye sabit bir mesaja çevirir; sebep hiç görünmez.
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      client_reference_id: profileId,
      /*
       * Kullanıcının Google e-postası. Üç işe yarıyor: makbuz kendisine
       * gidiyor, Stripe panelinde müşteri kimliksiz görünmüyor ve metadata
       * bir şekilde kaybolursa ödeme e-postadan sahibine bağlanabiliyor.
       */
      customer_email: user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: DAILY_PRICE_USD * 100,
            recurring: { interval: "day" },
            product_data: {
              name: "partim.lol — Hızlı oy",
              description:
                `Oy bekleme süresi ${COOLDOWN_SECONDS} saniyeye iner. Günlük abonelik, ` +
                "istediğin an iptal edebilirsin. Oyun içi dijital ayrıcalık; siyasi bağış değildir.",
            },
          },
        },
      ],
      // Webhook hakkı bu bilgiyle veriyor.
      subscription_data: {
        metadata: { kind: "fast_votes", user_id: profileId },
      },
      metadata: { kind: "fast_votes", user_id: profileId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe oturumu açılamadı.";
    return json({ error: `Stripe: ${message}` }, 502);
  }

  return json({ url: session.url });
});
