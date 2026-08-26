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

/**
 * Stripe'a gönderilebilecek bir e-posta mı?
 *
 * `user.email` anonim oturumda BOŞ DİZE olarak geliyor, null değil. `?? undefined`
 * boş dizeyi yakalamadığı için Stripe'a `customer_email: ""` gidiyordu ve Stripe
 * "Invalid email address" deyip oturumu hiç açmıyordu: ödeme penceresi açılmıyordu.
 */
function epostaVarsa(eposta: string | null | undefined): string | undefined {
  const e = (eposta ?? "").trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : undefined;
}

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

  let body: {
    provinceId?: string;
    partyId?: string;
    /** "siyasi" (varsayılan) veya "futbol" — futbol koltuğu football_* tablolarında. */
    map?: "siyasi" | "futbol";
    successUrl?: string;
    cancelUrl?: string;
    /** Ucu açık teklif. Verilmezse en az tutar kullanılır. */
    amount?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }

  const { provinceId, partyId, successUrl, cancelUrl } = body;
  const futbol = body.map === "futbol";
  if (!provinceId || !partyId || !successUrl || !cancelUrl) {
    return json({ error: "Eksik alan." }, 400);
  }

  const [{ data: province }, { data: party }] = await Promise.all([
    supabase.from("provinces").select("id,name").eq("id", provinceId).maybeSingle(),
    futbol
      ? supabase.from("football_clubs").select("id,name").eq("id", partyId).maybeSingle()
      : supabase.from("parties").select("id,name").eq("id", partyId).maybeSingle(),
  ]);
  if (!province || !party) {
    return json(
      { error: futbol ? "İl veya kulüp bulunamadı." : "İl veya parti bulunamadı." },
      400,
    );
  }

  // Zaten bu koltuğun sahibiyse ödeme almanın anlamı yok.
  const seatTablo = futbol ? "football_seats" : "leader_seats";
  const { data: seat } = await supabase
    .from(seatTablo)
    .select("user_id")
    .eq("province_id", provinceId)
    .eq(futbol ? "club_id" : "party_id", partyId)
    .maybeSingle();
  if (seat?.user_id === profileId) return json({ error: "Bu koltuk zaten senin." }, 409);

  const fiyatRpc = futbol ? "football_next_seat_price" : "next_seat_price";
  const fiyatParam = futbol
    ? { p_province_id: provinceId, p_club_id: partyId }
    : { p_province_id: provinceId, p_party_id: partyId };
  const { data: priceData, error: priceError } = await supabase.rpc(fiyatRpc, fiyatParam);
  if (priceError) return json({ error: priceError.message }, 500);

  const enAz = Number(priceData ?? 1);
  if (!Number.isFinite(enAz) || enAz <= 0) return json({ error: "Fiyat hesaplanamadı." }, 500);

  /*
   * Ucu açık fiyat.
   *
   * Kullanıcı en az tutarın üstünde istediğini ödeyebiliyor; ödediği tutar
   * koltuğun yeni değeri oluyor. İstemcinin gönderdiği sayıya güvenilmez:
   * alt sınırı burada veritabanından okuyup yeniden doğruluyoruz, yoksa
   * isteği elle atan biri $1'e her koltuğu alırdı.
   *
   * Tavan hem kazara fazladan sıfır yazmaya hem Stripe'ın kendi üst sınırına
   * çarpmaya karşı. lib/game.ts'teki LEADER_MAX_PRICE ile aynı.
   */
  const TAVAN = 100_000;
  const istenen = body.amount === undefined ? enAz : Number(body.amount);
  if (!Number.isFinite(istenen)) return json({ error: "Geçerli bir tutar gir." }, 400);
  if (Math.round(istenen * 100) !== istenen * 100) {
    return json({ error: "Tutar en fazla iki ondalık basamak olabilir." }, 400);
  }
  if (istenen < enAz) {
    return json({ error: `Bu koltuk için en az $${enAz} ödemelisin.`, minimum: enAz }, 409);
  }
  if (istenen > TAVAN) {
    return json({ error: `En fazla $${TAVAN} ödeyebilirsin.` }, 400);
  }
  const price = istenen;

  // Stripe hatası yakalanmazsa istemci sabit "non-2xx" mesajı görür, sebebi değil.
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: profileId,
      // Makbuz kullanıcıya gitsin.
      customer_email: epostaVarsa(user.email),
      // Koltuk fiyatı her devirde değiştiği için sabit Price nesnesi yerine anlık fiyat.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(price * 100),
            product_data: {
              name: futbol
                ? `${province.name} · ${party.name} kulüp başkanlığı`
                : `${province.name} · ${party.name} il başkanlığı`,
              description: futbol
                ? "partim.lol futbol oyun içi konum — gerçek kulüple bağlantısı yoktur."
                : "partim.lol oyun içi konum — siyasi bağış değildir.",
            },
          },
        },
      ],
      metadata: {
        user_id: profileId,
        province_id: provinceId,
        party_id: partyId,
        price: String(price),
        // Webhook koltuk devrini doğru tabloya/fonksiyona yönlendirsin.
        map: futbol ? "football" : "siyasi",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe oturumu açılamadı.";
    return json({ error: `Stripe: ${message}` }, 502);
  }

  return json({ url: session.url, price });
});
