/**
 * İşletmeci bilgileri — canlıya almadan ÖNCE doldurulmalı.
 *
 * Buradaki köşeli parantezli değerler yerini alana kadar Kullanım Koşulları ve
 * Gizlilik sayfaları ekranda uyarı gösterir. X (Twitter) geliştirici uygulaması
 * ve Stripe canlı modu, bu iki sayfanın gerçek bilgilerle yayında olmasını ister.
 */
export const SITE = {
  /** Siteyi işleten şahıs veya şirketin resmî unvanı */
  operator: "[İŞLETMECİ ADI]",
  /** Kullanıcıların ulaşabileceği iletişim adresi */
  email: "[iletisim@partim.lol]",
  /** Vergi/ticaret sicil bilgisi (şirketse) veya "Şahıs işletmesi" */
  registration: "[VERGİ / SİCİL BİLGİSİ]",
  country: "Türkiye",
  /** Hukuki metinlerin son güncellenme tarihi */
  updatedAt: "2026-08-23",
  /** Yayın adresi — özel alan adına geçince güncelleyin */
  url: "https://partim.lol",
} as const;

const PLACEHOLDER = /^\[.*\]$/;

/** İşletmeci bilgileri gerçekten doldurulmuş mu? */
export const isSiteConfigured = ![SITE.operator, SITE.email, SITE.registration].some((v) =>
  PLACEHOLDER.test(v),
);
