/**
 * create-checkout — bir il başkanlığı koltuğu için Stripe Checkout oturumu açar.
 *
 * Fiyatı istemci göndermez; veritabanındaki güncel koltuk bedeli üzerinden
 * (next_seat_price) burada hesaplanır. Koltuk asıl olarak stripe-webhook
 * fonksiyonunda, ödeme onaylandıktan sonra devredilir.
 *
 * Gerekli gizli anahtarlar:
 *   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
 */
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

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
  if (req.method !== "POST") return json({ error: "Yalnızca POST" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Giriş gerekli." }, 401);

  // Kullanıcıyı kendi jetonuyla doğrula (service_role burada kullanılmaz).
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

  let body: { provinceId?: string; partyId?: string; successUrl?: string; cancelUrl?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }

  const { provinceId, partyId, successUrl, cancelUrl } = body;
  if (!provinceId || !partyId || !successUrl || !cancelUrl) {
    return json({ error: "Eksik alan." }, 400);
  }

  const [{ data: province }, { data: party }] = await Promise.all([
    supabase.from("provinces").select("id,name").eq("id", provinceId).maybeSingle(),
    supabase.from("parties").select("id,name").eq("id", partyId).maybeSingle(),
  ]);
  if (!province || !party) return json({ error: "İl veya parti bulunamadı." }, 400);

  // Zaten bu koltuğun sahibiyse ödeme almanın anlamı yok.
  const { data: seat } = await supabase
    .from("leader_seats")
    .select("user_id")
    .eq("province_id", provinceId)
    .eq("party_id", partyId)
    .maybeSingle();
  if (seat?.user_id === profileId) return json({ error: "Bu koltuk zaten senin." }, 409);

  const { data: priceData, error: priceError } = await supabase.rpc("next_seat_price", {
    p_province_id: provinceId,
    p_party_id: partyId,
  });
  if (priceError) return json({ error: priceError.message }, 500);

  const price = Number(priceData ?? 1);
  if (!Number.isFinite(price) || price <= 0) return json({ error: "Fiyat hesaplanamadı." }, 500);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: profileId,
    // Koltuk fiyatı her devirde değiştiği için sabit Price nesnesi yerine anlık fiyat.
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(price * 100),
          product_data: {
            name: `${province.name} · ${party.name} il başkanlığı`,
            description: "partim.lol oyun içi konum — siyasi bağış değildir.",
          },
        },
      },
    ],
    metadata: {
      user_id: profileId,
      province_id: provinceId,
      party_id: partyId,
      price: String(price),
    },
  });

  return json({ url: session.url, price });
});
