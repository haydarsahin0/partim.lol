/**
 * Ödemeyi hesaba işleyen tek yer.
 *
 * NEDEN AYRI BİR MODÜL
 *
 * Ödeme daha önce yalnızca webhook üzerinden işleniyordu ve abonelikler
 * yalnızca `invoice.paid` olayını dinliyordu. Stripe uç noktasında o olay
 * seçili değilse (ya da olay yükünün API sürümü `invoice.subscription`
 * alanını taşımıyorsa) ödeme başarıyla alınıyor, hiçbir şey olmuyordu —
 * kullanıcı parayı ödüyor, hakkı gelmiyordu. Sessizce, üstelik Stripe'a 200
 * dönerek.
 *
 * Artık iki bağımsız yol aynı işi yapıyor: webhook ve kullanıcı ödemeden
 * döndüğünde çağrılan confirm-checkout. İkisi de burayı çağırıyor.
 * Uygulama işlemleri tekrara dayanıklı: koltuk alımı oturum kimliğiyle bir
 * kez işleniyor, abonelik tarihi `greatest` ile ileri gidiyor.
 */
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

export type UygulamaSonucu = {
  ok: boolean;
  kind?: string;
  message?: string;
  detay?: unknown;
};

/**
 * Aboneliğin bittiği an.
 *
 * `current_period_end` Stripe'ın yeni API sürümlerinde abonelik nesnesinden
 * kalem satırına taşındı. Uç noktanın API sürümünü biz seçmiyoruz, o yüzden
 * ikisine de bakıyoruz; hiçbiri yoksa bugünün sonuna kadar veriyoruz ki
 * ödeme yapan kullanıcı en azından hakkını alsın.
 */
export function donemSonu(subscription: Stripe.Subscription, yedekGun = 1): string {
  const kokten = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const kalemden = subscription.items?.data?.[0] as unknown as
    | { current_period_end?: number }
    | undefined;
  const saniye = kokten ?? kalemden?.current_period_end;
  if (saniye && Number.isFinite(saniye)) return new Date(saniye * 1000).toISOString();
  return new Date(Date.now() + yedekGun * 24 * 60 * 60 * 1000).toISOString();
}

/** Aboneliğin kimliği — API sürümüne göre farklı yerde durabiliyor. */
export function faturaAboneligi(invoice: Stripe.Invoice): string | null {
  const duz = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  if (typeof duz === "string") return duz;
  if (duz && typeof duz === "object" && "id" in duz) return duz.id;

  // Yeni sürümlerde fatura, aboneliği `parent` altında taşıyor.
  const ebeveyn = (invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
  }).parent;
  const alt = ebeveyn?.subscription_details?.subscription;
  if (typeof alt === "string") return alt;
  if (alt && typeof alt === "object" && "id" in alt) return alt.id;

  const satir = invoice.lines?.data?.[0] as unknown as { subscription?: string } | undefined;
  return satir?.subscription ?? null;
}

/** Aboneliğin müşteri kimliği — API sürümüne göre nesne ya da metin olabilir. */
export function musteriKimligi(
  kaynak: { customer?: string | { id: string } | null },
): string | null {
  const c = kaynak.customer;
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "id" in c) return c.id;
  return null;
}

/**
 * Ödemenin sahibini bul.
 *
 * Önce metadata'daki profil kimliği; yoksa Stripe müşterisinin e-postası.
 * İkinci yol elle açılmış ya da metadata'sı kaybolmuş abonelikler için:
 * kullanıcı Google ile girdiği için e-posta ikisinde de aynı.
 */
export async function sahibiBul(
  stripe: Stripe,
  admin: SupabaseClient,
  meta: Record<string, string>,
  customerId: string | null,
): Promise<string | null> {
  if (meta.user_id) return meta.user_id;
  if (!customerId) return null;

  try {
    const musteri = await stripe.customers.retrieve(customerId);
    const eposta = (musteri as Stripe.Customer).email;
    if (!eposta) return null;
    const { data } = await admin.rpc("find_profile_by_email", { p_email: eposta });
    return (data as string | null) ?? null;
  } catch {
    return null;
  }
}

/** Hızlı oy aboneliğini uygular. */
export async function hizliOyUygula(
  admin: SupabaseClient,
  subscriptionId: string,
  userId: string,
  periodEnd: string,
  customerId: string | null = null,
): Promise<UygulamaSonucu> {
  const { data, error } = await admin.rpc("apply_fast_votes_subscription", {
    p_subscription_id: subscriptionId,
    p_user_id: userId,
    p_period_end: periodEnd,
    p_customer_id: customerId,
  });
  if (!error) return { ok: true, kind: "fast_votes", detay: data };

  /*
   * ESKİ İMZAYA DÜŞ.
   *
   * Fonksiyona dördüncü parametre (müşteri kimliği) sonradan eklendi. Edge
   * fonksiyonları ile veritabanı ayrı ayrı dağıtıldığı için, fonksiyonlar
   * yüklenmiş ama migration henüz uygulanmamış olabiliyor. O aralıkta PostgREST
   * "böyle bir fonksiyon yok" diyor ve ÖDEME ALINMIŞ ABONELİK HESABA
   * DÜŞMÜYORDU — sessizce. Üç parametreli sürümle tekrar deniyoruz: müşteri
   * kimliği kaydedilmez ama kullanıcı hakkını alır, ki asıl önemli olan bu.
   */
  const bulunamadi = /could not find the function|does not exist|schema cache/i.test(
    error.message ?? "",
  );
  if (!bulunamadi) return { ok: false, kind: "fast_votes", message: error.message };

  const yedek = await admin.rpc("apply_fast_votes_subscription", {
    p_subscription_id: subscriptionId,
    p_user_id: userId,
    p_period_end: periodEnd,
  });
  if (yedek.error) return { ok: false, kind: "fast_votes", message: yedek.error.message };
  console.warn("apply_fast_votes_subscription eski imzayla uygulandı (migration bekliyor)");
  return { ok: true, kind: "fast_votes", detay: yedek.data };
}

/** Parti aboneliğini uygular. */
export async function partiUygula(
  admin: SupabaseClient,
  subscriptionId: string,
  meta: Record<string, string>,
  periodEnd: string,
  logoUrl: string | null,
): Promise<UygulamaSonucu> {
  const { data, error } = await admin.rpc("apply_party_subscription", {
    p_subscription_id: subscriptionId,
    p_user_id: meta.user_id,
    p_name: meta.party_name,
    p_short_name: meta.party_short,
    p_color: meta.party_color,
    p_logo_url: logoUrl,
    p_period_end: periodEnd,
  });
  if (error) return { ok: false, kind: "custom_party", message: error.message };
  return { ok: true, kind: "custom_party", detay: data };
}

/** Koltuk alımını uygular. */
export async function koltukUygula(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<UygulamaSonucu> {
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const userId = meta.user_id ?? session.client_reference_id ?? null;
  const amount = (session.amount_total ?? 0) / 100;

  if (!userId || !meta.province_id || !meta.party_id || amount <= 0) {
    return { ok: false, kind: "seat", message: "Eksik metadata." };
  }

  const { data, error } = await admin.rpc("apply_seat_purchase", {
    p_session_id: session.id,
    p_user_id: userId,
    p_province_id: meta.province_id,
    p_party_id: meta.party_id,
    p_amount: amount,
  });
  if (error) return { ok: false, kind: "seat", message: error.message };
  return { ok: true, kind: "seat", detay: data };
}

/**
 * Ödenmiş bir Checkout oturumunu hesaba işler.
 *
 * Hem webhook (checkout.session.completed) hem de kullanıcının ödemeden
 * dönüşü buradan geçiyor.
 */
export async function oturumuUygula(
  stripe: Stripe,
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<UygulamaSonucu> {
  const meta = (session.metadata ?? {}) as Record<string, string>;

  if (session.mode === "subscription") {
    // Abonelik ödemesi tamamlanmadıysa hak verilmez.
    if (session.status !== "complete" || session.payment_status === "unpaid") {
      return { ok: false, kind: meta.kind, message: "Ödeme tamamlanmamış." };
    }

    const subId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subId) return { ok: false, kind: meta.kind, message: "Abonelik bulunamadı." };

    const subscription = await stripe.subscriptions.retrieve(subId);
    const abonelikMeta = { ...meta, ...(subscription.metadata ?? {}) } as Record<string, string>;
    const periodEnd = donemSonu(subscription, abonelikMeta.kind === "custom_party" ? 7 : 1);

    const musteri = musteriKimligi(subscription) ?? musteriKimligi(session);

    if (abonelikMeta.kind === "fast_votes") {
      const sahip = await sahibiBul(stripe, admin, abonelikMeta, musteri);
      if (!sahip) return { ok: false, kind: "fast_votes", message: "Ödemenin sahibi bulunamadı." };
      return hizliOyUygula(admin, subId, sahip, periodEnd, musteri);
    }
    if (abonelikMeta.kind === "custom_party") {
      // İlk ödemede logo, Checkout oturumuna bağlı geçici satırda duruyor.
      const { data: pending } = await admin
        .from("pending_party_logos")
        .select("logo_url")
        .eq("session_id", session.id)
        .maybeSingle();
      const logoUrl = (pending?.logo_url as string | undefined) ?? null;
      const sonuc = await partiUygula(admin, subId, abonelikMeta, periodEnd, logoUrl);
      if (sonuc.ok && logoUrl) {
        await admin.from("pending_party_logos").delete().eq("session_id", session.id);
      }
      return sonuc;
    }
    return { ok: false, kind: abonelikMeta.kind, message: "Bilinmeyen abonelik türü." };
  }

  if (session.payment_status !== "paid") {
    return { ok: false, kind: "seat", message: "Ödeme tamamlanmamış." };
  }
  return koltukUygula(admin, session);
}
