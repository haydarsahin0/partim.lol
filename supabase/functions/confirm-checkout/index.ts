/**
 * confirm-checkout — kullanıcı ödemeden döndüğünde hakkı doğrulayıp işler.
 *
 * NEDEN VAR
 *
 * Ödeme yalnızca webhook'a bağlı olduğunda, Stripe uç noktası yanlış
 * kurulduysa ya da bir olay düştüyse kullanıcı parayı ödüyor ve hiçbir şey
 * olmuyor — üstelik kimse fark etmiyor. Bu fonksiyon ikinci bağımsız yol:
 * istemci ödemeden dönerken oturum kimliğini getiriyor, biz Stripe'a sorup
 * gerçekten ödendiğini doğruluyoruz ve hakkı veriyoruz.
 *
 * Güvenlik: hak istemcinin söylediğine göre değil, Stripe'ın söylediğine göre
 * veriliyor. Oturumun bu kullanıcıya ait olduğu da ayrıca denetleniyor —
 * başkasının oturum kimliğiyle hak alınamaz.
 */
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { oturumuUygula } from "../_shared/applyCheckout.ts";

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
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const profileId = profileRow?.id as string | undefined;
  if (!profileId) return json({ error: "Hesap bulunamadı." }, 401);

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }

  const sessionId = (body.sessionId ?? "").trim();
  if (!sessionId.startsWith("cs_")) return json({ error: "Geçersiz oturum." }, 400);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Oturum okunamadı.";
    return json({ error: `Stripe: ${message}` }, 502);
  }

  // Oturum bu kullanıcıya ait olmalı: başkasının kimliğiyle hak alınamaz.
  const sahip = (session.metadata ?? {}).user_id ?? session.client_reference_id;
  if (sahip !== profileId) return json({ error: "Bu ödeme bu hesaba ait değil." }, 403);

  const sonuc = await oturumuUygula(stripe, admin, session);
  if (!sonuc.ok) {
    console.error("confirm-checkout uygulanamadı", { sessionId, sonuc });
    return json({ error: sonuc.message ?? "Ödeme işlenemedi.", kind: sonuc.kind }, 409);
  }

  return json({ ok: true, kind: sonuc.kind, detay: sonuc.detay });
});
