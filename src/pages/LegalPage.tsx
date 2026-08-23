import { useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SITE, isSiteConfigured } from "@/lib/site";
import {
  LEADER_BASE_PRICE,
  LEADER_PRICE_STEP,
  XP_PER_LEADER_HOUR,
  formatUsd,
} from "@/lib/game";

type Section = { title: string; body: string[] };

/**
 * Kullanım Koşulları ve Gizlilik metinleri.
 *
 * Bunlar hukukçu onayından geçmiş metinler değil, doldurulacak bir taslaktır:
 * işletmeci bilgileri src/lib/site.ts içinde tanımlanır ve doldurulmadığı sürece
 * sayfanın başında uyarı görünür. X geliştirici uygulaması ve Stripe canlı modu
 * bu iki adresin yayında olmasını şart koşar.
 */

const TERMS: Section[] = [
  {
    title: "1. Bu site nedir?",
    body: [
      `partim.lol, Türkiye haritası üzerinde oynanan bir siyaset temalı simülasyon oyunudur. Site ${SITE.operator} tarafından işletilir (${SITE.registration}, ${SITE.country}).`,
      "Oyun içindeki oylar bir kamuoyu araştırması, anket veya seçim değildir. Sonuçlar hiçbir resmî veriyi temsil etmez ve gerçek seçim sonuçlarıyla ilgisi yoktur.",
      "Oyunda geçen parti adları ve renkleri yalnızca tanınırlık amacıyla kullanılmıştır. Hiçbir siyasi parti, kurum veya kişiyle bağlantımız, onları temsil yetkimiz ya da onayları yoktur.",
    ],
  },
  {
    title: "2. Hesap",
    body: [
      "Oyuna X (Twitter) hesabınızla giriş yaparsınız. Girişte yalnızca herkese açık kullanıcı adınız, görünen adınız ve profil görseliniz alınır; gönderileriniz okunmaz, adınıza hiçbir paylaşım yapılmaz.",
      "Hesabınızla yapılan işlemlerden siz sorumlusunuz. Otomatik araçlarla oy kullanmak, çok hesap açarak sonuçları etkilemek veya siteyi olağandışı yükle zorlamak yasaktır; bu durumda hesap kapatılabilir.",
      "Hesabınızın silinmesini istediğinizde " + SITE.email + " adresine yazmanız yeterlidir.",
    ],
  },
  {
    title: "3. Oyun kuralları",
    body: [
      "Her oyuncu saatte bir oy kullanabilir ve her oy 1 XP kazandırır. Kurallar, oyunun dengesi için önceden haber verilmeksizin değiştirilebilir.",
      `İl başkanlığı koltukları oyun içi dijital konumlardır. Boş bir koltuk ${formatUsd(LEADER_BASE_PRICE)}, dolu bir koltuğun devralınması ise o anki bedelin ${formatUsd(LEADER_PRICE_STEP)} fazlasıdır. Koltuğu elinizde tuttuğunuz her saat ${XP_PER_LEADER_HOUR} XP kazandırır.`,
      "Bir koltuğu satın almanız onun kalıcı olarak sizde kalacağı anlamına gelmez: başka bir oyuncu her zaman daha yüksek bedel ödeyip devralabilir. Bu, oyunun temel kuralıdır.",
    ],
  },
  {
    title: "4. Ödemeler ve iade",
    body: [
      "Ödemeler Stripe üzerinden alınır; kart bilgileriniz bize hiçbir zaman ulaşmaz ve tarafımızca saklanmaz.",
      "Satın alınan şey dijital bir oyun içi konumdur ve ödeme onaylandığı anda kullanıma açılır. Bu nedenle kullanıma açılmış bir satın alma için iade yapılmaz.",
      "İki istisna vardır: (a) ödeme sırasında koltuk başka bir oyuncuya geçtiği için satın almanız uygulanamazsa ödemeniz iade edilir; (b) teknik bir hata nedeniyle satın aldığınız konum size verilmediyse ödemeniz iade edilir. Her iki durumda da " + SITE.email + " adresine yazın.",
      "Bu ödemeler siyasi bağış değildir; hiçbir partiye veya adaya aktarılmaz.",
    ],
  },
  {
    title: "5. Sorumluluk",
    body: [
      "Site olduğu gibi sunulur. Kesintisiz çalışacağı veya oyun verilerinin kaybolmayacağı garanti edilmez.",
      "Oyunun kapatılması hâlinde durum önceden duyurulur; duyurudan sonra yeni satın alma alınmaz.",
    ],
  },
];

const PRIVACY: Section[] = [
  {
    title: "1. Hangi verileri işliyoruz?",
    body: [
      "X (Twitter) ile giriş yaptığınızda sağlayıcıdan gelen kullanıcı adınız, görünen adınız, profil görseliniz ve hesap kimliğiniz saklanır. E-posta adresiniz talep edilmez.",
      "Oyun verisi olarak: kullandığınız oylar (hangi ilde hangi partiye, ne zaman), XP ve seviyeniz, sahip olduğunuz il başkanlığı koltukları ve satın alma kayıtlarınız tutulur.",
      "Kart bilgileriniz bize hiç ulaşmaz; ödeme Stripe tarafından yürütülür ve bizde yalnızca ödemenin tutarı ile Stripe oturum kimliği kalır.",
    ],
  },
  {
    title: "2. Neyi herkes görebilir?",
    body: [
      "Bu bir kamuya açık oyundur: kullanıcı adınız, seviyeniz, XP'niz ve sahip olduğunuz il başkanlıkları sıralamada ve il sayfalarında herkese görünür.",
      "Kullandığınız oylar da ilin \"son oylar\" akışında kullanıcı adınızla birlikte görünür. Oyunuzu gizli tutmak istiyorsanız oy kullanmayın.",
    ],
  },
  {
    title: "3. Nerede saklanıyor?",
    body: [
      "Veriler Supabase (Postgres) üzerinde, ödeme kayıtları Stripe üzerinde tutulur. Bu sağlayıcıların sunucuları Türkiye dışında bulunabilir.",
      "Site GitHub Pages üzerinden yayınlanır; GitHub, sayfayı sunarken IP adresiniz gibi teknik kayıtları kendi politikası kapsamında işleyebilir.",
      "Reklam veya izleme çerezi kullanılmaz. Tarayıcınızda yalnızca oturumunuzu açık tutan ve arayüz tercihlerinizi hatırlayan kayıtlar tutulur.",
    ],
  },
  {
    title: "4. Haklarınız",
    body: [
      `Verilerinize erişmek, düzeltilmesini veya silinmesini istemek için ${SITE.email} adresine yazabilirsiniz. Hesabınızı sildiğimizde oylarınız ve koltuklarınız da silinir; silinen satın almalar için iade yapılmaz.`,
      "Talebiniz makul bir süre içinde, en geç 30 gün içinde sonuçlandırılır.",
    ],
  },
];

export default function LegalPage() {
  const { pathname } = useLocation();
  const isPrivacy = pathname.includes("gizlilik");
  const sections = isPrivacy ? PRIVACY : TERMS;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          {isPrivacy ? "Gizlilik Politikası" : "Kullanım Koşulları"}
        </h1>
        <p className="text-sm text-muted-foreground">Son güncelleme: {SITE.updatedAt}</p>
      </div>

      {!isSiteConfigured && (
        <Card className="border-amber-400/25 bg-amber-400/[0.08] p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <div className="text-sm text-amber-100/90">
              <strong className="font-semibold">Bu metin henüz taslak.</strong> İşletmeci adı,
              iletişim adresi ve sicil bilgisi <code className="rounded bg-white/10 px-1 text-xs">src/lib/site.ts</code>{" "}
              dosyasında doldurulmadı. Siteyi gerçek ödeme alacak şekilde yayına almadan önce bu
              bilgileri girin ve metni kendi durumunuza göre gözden geçirin.
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-6 p-6">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="font-display text-base font-bold">{section.title}</h2>
            <div className="mt-2 space-y-2">
              {section.body.map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        <section className="border-t border-white/[0.08] pt-4">
          <h2 className="font-display text-base font-bold">İletişim</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {SITE.operator} · {SITE.email}
          </p>
        </section>
      </Card>
    </div>
  );
}
