/**
 * create-party-subscription — kendi partisini kurmak isteyen kullanıcı için
 * haftalık Stripe aboneliği başlatır.
 *
 * Parti, ödeme onaylanmadan açılmaz: gerçek kayıt stripe-webhook fonksiyonunda,
 * apply_party_subscription() ile yapılır. Burada yalnızca doğrulama ve Checkout
 * oturumu var.
 *
 * Gizli anahtar: STRIPE_SECRET_KEY
 */
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const WEEKLY_PRICE_USD = 9;
const SHORT_MIN = 2;
const SHORT_MAX = 6;
/** lib/color.ts ile aynı eşik */
const MIN_COLOR_DISTANCE = 0.09;

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

/* --- Renk yakınlığı: istemcideki OKLab ölçümünün birebir kopyası ----------- */

function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function toOklab(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = srgbToLinear((n >> 16) & 255);
  const g = srgbToLinear((n >> 8) & 255);
  const b = srgbToLinear(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s,
  ];
}

function colorDistance(a: string, b: string) {
  const la = toOklab(a);
  const lb = toOklab(b);
  if (!la || !lb) return Number.POSITIVE_INFINITY;
  return Math.hypot((la[0] - lb[0]) * 0.6, la[1] - lb[1], la[2] - lb[2]);
}

/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Yalnızca POST" }, 405);

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
  // hesapları göçü): metadata'ya profil kimliği yazılmalı, yoksa webhook
  // koltuğu/partiyi yanlış satıra bağlar.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const profileId = profileRow?.id as string | undefined;
  if (!profileId) return json({ error: "Hesap bulunamadı." }, 401);

  let body: {
    name?: string;
    shortName?: string;
    color?: string;
    logoDataUrl?: string | null;
    successUrl?: string;
    cancelUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }

  const name = (body.name ?? "").trim();
  const shortName = (body.shortName ?? "").trim().toUpperCase();
  const color = (body.color ?? "").trim().toUpperCase();

  if (name.length < 3 || name.length > 40) return json({ error: "Parti adı 3–40 karakter olmalı." }, 400);
  if (shortName.length < SHORT_MIN || shortName.length > SHORT_MAX) {
    return json({ error: `Kısaltma ${SHORT_MIN}–${SHORT_MAX} harf olmalı.` }, 400);
  }
  if (!/^#[0-9A-F]{6}$/.test(color)) return json({ error: "Geçersiz renk." }, 400);
  if (!body.successUrl || !body.cancelUrl) return json({ error: "Eksik alan." }, 400);

  // Logo boyutu: istemci 128px PNG üretiyor, ~40 KB. Tavan bunun rahat üstünde.
  const logo = body.logoDataUrl ?? null;
  if (logo && (!logo.startsWith("data:image/") || logo.length > 300_000)) {
    return json({ error: "Logo geçersiz veya çok büyük." }, 400);
  }

  // Renk, mevcut partilerin hiçbirine yakın olmamalı — istemcideki denetimin
  // sunucu tarafı karşılığı; istemciye güvenmiyoruz.
  const { data: parties, error: partiesError } = await supabase
    .from("parties")
    .select("name,color,full_name");
  if (partiesError) return json({ error: partiesError.message }, 500);

  for (const party of parties ?? []) {
    if (colorDistance(color, party.color) < MIN_COLOR_DISTANCE) {
      return json({ error: `Renk ${party.name} rengine çok yakın.` }, 409);
    }
    if ((party.full_name ?? "").toLowerCase() === name.toLowerCase()) {
      return json({ error: "Bu adda bir parti zaten var." }, 409);
    }
  }

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
      // Makbuz kullanıcıya gitsin ve müşteri Stripe panelinde kimliksiz kalmasın.
      customer_email: user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: WEEKLY_PRICE_USD * 100,
            recurring: { interval: "week" },
            product_data: {
              name: `partim.lol — ${name} (${shortName})`,
              description: "Haftalık parti aboneliği. Oyun içi dijital konum; siyasi bağış değildir.",
            },
          },
        },
      ],
      // Webhook partiyi bu bilgilerle açar.
      subscription_data: {
        metadata: {
          kind: "custom_party",
          user_id: profileId,
          party_name: name,
          party_short: shortName,
          party_color: color,
        },
      },
      metadata: {
        kind: "custom_party",
        user_id: profileId,
        party_name: name,
        party_short: shortName,
        party_color: color,
        // Logo metadata'ya sığmaz; oturum kimliğiyle geçici tabloya yazılır.
        has_logo: logo ? "1" : "0",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe oturumu açılamadı.";
    return json({ error: `Stripe: ${message}` }, 502);
  }

  // Logoyu Stripe metadata'sında taşıyamayız (500 karakter sınırı), bu yüzden
  // oturum kimliğiyle eşleştirip webhook'ta okuyoruz.
  if (logo) {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    await admin.from("pending_party_logos").upsert({
      session_id: session.id,
      logo_url: logo,
    });
  }

  return json({ url: session.url });
});
