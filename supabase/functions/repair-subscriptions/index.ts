/**
 * repair-subscriptions — Stripe'ta ödenmiş ama hesaba işlenmemiş abonelikleri
 * bulup uygular.
 *
 * NEDEN VAR
 *
 * Abonelikler bir dönem yalnızca `invoice.paid` olayından işleniyordu. Stripe
 * uç noktasında o olay seçili değilse ödeme alınıyor ama hak hiç gelmiyordu;
 * en az bir kullanıcı bu yüzden parasını ödeyip hızlı oy hakkını alamadı.
 * Webhook artık iki olaydan da işliyor ve ayrıca ödemeden dönüşte
 * confirm-checkout çalışıyor — ama geçmişte kaybedilenleri kimse geri
 * getirmiyor. Bu iş onu yapıyor: Stripe'taki bütün etkin abonelikleri gezip
 * hakları yeniden uyguluyor.
 *
 * Tekrar çalıştırmak zararsız: uygulama işlemleri tekrara dayanıklı, tarih
 * `greatest` ile ileri gidiyor.
 *
 * Yetki: kullanıcı oturumu değil, REPAIR_KEY gizli anahtarı ile korunuyor;
 * --no-verify-jwt ile yüklenir ve yalnızca iş akışından çağrılır.
 */
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { donemSonu, hizliOyUygula, partiUygula } from "../_shared/applyCheckout.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const beklenen = Deno.env.get("REPAIR_KEY") ?? "";
  const gelen = req.headers.get("x-repair-key") ?? "";
  if (!beklenen || gelen !== beklenen) return json({ error: "Yetkisiz." }, 401);

  const rapor: Array<Record<string, unknown>> = [];
  let taranan = 0;

  // Etkin ve ödemesi gecikmiş olanlar; iptal edilmişler zaten hak vermiyor.
  for (const durum of ["active", "trialing", "past_due"] as const) {
    for await (const sub of stripe.subscriptions.list({ status: durum, limit: 100 })) {
      taranan++;
      const meta = (sub.metadata ?? {}) as Record<string, string>;
      if (!meta.kind || !meta.user_id) {
        rapor.push({ id: sub.id, durum, sonuc: "atlandı", sebep: "metadata yok" });
        continue;
      }

      if (meta.kind === "fast_votes") {
        const sonuc = await hizliOyUygula(admin, sub.id, meta.user_id, donemSonu(sub, 1));
        rapor.push({ id: sub.id, durum, kind: meta.kind, user: meta.user_id, sonuc });
        continue;
      }

      if (meta.kind === "custom_party") {
        const sonuc = await partiUygula(admin, sub.id, meta, donemSonu(sub, 7), null);
        rapor.push({ id: sub.id, durum, kind: meta.kind, user: meta.user_id, sonuc });
        continue;
      }

      rapor.push({ id: sub.id, durum, sonuc: "atlandı", sebep: `bilinmeyen tür: ${meta.kind}` });
    }
  }

  return json({ ok: true, taranan, uygulanan: rapor.length, rapor });
});
