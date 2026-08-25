/**
 * cancel-fast-votes-subscription — günlük hızlı oy aboneliğini iptal eder
 * ya da iptali geri alır.
 *
 * NEDEN VAR
 *
 * İptalin tek yolu Stripe'ın gönderdiği makbuz e-postasındaki bağlantıydı.
 * E-postayı bulamayan kullanıcının elinde hiçbir yol kalmıyordu. Para alan
 * bir üründe "nasıl bırakırım" sorusunun cevabı ürünün içinde olmalı.
 *
 * NE YAPIYOR
 *
 * Aboneliği anında SİLMİYOR: Stripe'ta `cancel_at_period_end` işaretliyor.
 * Kullanıcı parasını ödediği günün sonuna kadar hakkını kullanıyor; dönem
 * bitince Stripe `customer.subscription.deleted` gönderiyor ve hak orada
 * kapanıyor. Ne iade gerekiyor ne de satın alınmış bir hak kesiliyor.
 *
 * GÜVENLİK
 *
 * Abonelik kimliği istemciden ALINMIYOR — çağıranın kendi profil satırından
 * okunuyor. Böylece kimse başkasının abonelik kimliğini gönderip onun
 * aboneliğini iptal edemez. Ayrıca Stripe'tan okunan aboneliğin gerçekten bu
 * hesaba ait olduğu (metadata ya da müşteri kimliği) bir kez daha denetleniyor.
 *
 * Gizli anahtar: STRIPE_SECRET_KEY
 */
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { donemSonu } from "../_shared/applyCheckout.ts";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

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

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id,fast_votes_subscription_id,fast_votes_until,stripe_customer_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const profileId = profileRow?.id as string | undefined;
  if (!profileId) return json({ error: "Hesap bulunamadı." }, 401);

  let body: { iptal?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }
  // Varsayılan iptal: gövde boş gelse bile kullanıcının niyeti bu.
  const iptal = body.iptal !== false;

  const subscriptionId = (profileRow?.fast_votes_subscription_id as string | null) ?? null;
  if (!subscriptionId) {
    /*
     * Hakkı var ama abonelik kimliği yok: elle verilmiş ya da onarımdan gelmiş
     * bir hak. İptal edilecek yinelenen bir ödeme de yok — kullanıcıyı boşuna
     * korkutmayalım, durumu olduğu gibi söyleyelim.
     */
    const until = profileRow?.fast_votes_until as string | null;
    if (until && Date.parse(until) > Date.now()) {
      return json(
        {
          error:
            "Bu hakkın yinelenen bir ödemeye bağlı değil: süresi dolunca kendiliğinden bitecek, " +
            "senden yeni bir tahsilat yapılmayacak.",
        },
        409,
      );
    }
    return json({ error: "Etkin bir aboneliğin yok." }, 404);
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Abonelik okunamadı.";
    return json({ error: `Stripe: ${message}` }, 502);
  }

  /*
   * Abonelik gerçekten bu hesabın mı?
   *
   * Kimliği zaten kullanıcının kendi satırından okuduk, yani bu kontrol
   * fazladan bir kat. Yine de duruyor: veri bir gün karışırsa (elle düzeltme,
   * onarım betiği, göç) yanlış aboneliği iptal etmektense hiç etmemek daha iyi.
   */
  const meta = (subscription.metadata ?? {}) as Record<string, string>;
  const musteri =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const bizeAit =
    meta.user_id === profileId ||
    (!!musteri && musteri === (profileRow?.stripe_customer_id as string | null));
  if (!bizeAit) {
    console.error("Abonelik sahibi eşleşmedi", { subscriptionId, profileId });
    return json({ error: "Bu abonelik bu hesaba bağlı görünmüyor." }, 403);
  }

  if (subscription.status === "canceled") {
    return json({ error: "Bu abonelik zaten sonlanmış." }, 409);
  }

  if (subscription.cancel_at_period_end === iptal) {
    // Zaten istenen durumda. Hata değil; arayüz doğru göstersin diye başarı dön.
    const bitis = donemSonu(subscription, 1);
    await admin.rpc("set_fast_votes_cancel", {
      p_subscription_id: subscriptionId,
      p_cancel_at: iptal ? bitis : null,
    });
    return json({ ok: true, iptal, cancelAt: iptal ? bitis : null, degismedi: true });
  }

  let guncel: Stripe.Subscription;
  try {
    guncel = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: iptal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Abonelik güncellenemedi.";
    return json({ error: `Stripe: ${message}` }, 502);
  }

  const bitis = donemSonu(guncel, 1);

  /*
   * Arayüzün doğru göstermesi için işareti profile de yazıyoruz.
   *
   * Asıl kayıt Stripe'ta. Buradaki yazma başarısız olsa bile iptal geçerli —
   * o yüzden hata kullanıcıya "iptal olmadı" diye dönmüyor, yalnızca günlüğe
   * düşüyor. `customer.subscription.updated` olayı da aynı işareti yazıyor,
   * yani ikinci bir yol var.
   */
  const { error: rpcHatasi } = await admin.rpc("set_fast_votes_cancel", {
    p_subscription_id: subscriptionId,
    p_cancel_at: iptal ? bitis : null,
  });
  if (rpcHatasi) console.error("set_fast_votes_cancel hatası", rpcHatasi);

  return json({ ok: true, iptal, cancelAt: iptal ? bitis : null });
});
