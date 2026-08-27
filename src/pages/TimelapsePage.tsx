import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ImageDown, Images, Loader2, Pause, Play, RotateCcw, Video } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import type { VoteHistory, VoteHistoryBucket } from "@/backend/types";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";
import { formatNumber } from "@/lib/game";
import { buildFrames, lerpFrame, scopeFrame, syntheticHistory, type Frame } from "@/lib/timelapse";
import {
  BOYUTLAR,
  FUTBOL_KAYNAK,
  SIYASI_KAYNAK,
  STILLER,
  STIL_LIST,
  devirHaritasi,
  drawFrame,
  guvenliPay,
  type CizimSecenekleri,
  type DevirBilgisi,
  type Kalite,
  type Oran,
  type VideoStil,
} from "@/lib/timelapseRenderer";
import { FOOTBALL_TEAMS } from "@/data/footballTeams";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Kaynak = "gercek" | "ornek";

/**
 * Video süresi: ya seçilir ya da veriden hesaplanır.
 *
 * ESKİDEN NE OLUYORDU
 *
 * Süre yalnızca hesaplanıyordu ve tavan 20 saniyeydi. Oyun büyüdükçe veri
 * karesi sayısı tavanı her zaman aşıyor, hesap hep 20'ye kırpılıyordu: hangi
 * ayar seçilirse seçilsin video 20 sn + 1,2 sn bitiş duraklaması = 21 saniye
 * çıkıyordu. Üstelik yüzlerce veri karesi 20 saniyeye sıkıştığı için oylar
 * sıçrayarak akıyordu.
 *
 * Şimdi: tavan 60 saniye ve saniyede gösterilen veri karesi 12'ye çekildi
 * (akıcılığın ölçüsü bu — saniyede kaç kova geçtiği). İsteyen süreyi
 * doğrudan seçebiliyor; "Otomatik" veriye göre 8–60 sn arasında değişiyor.
 */
const SANIYEDE_VERI_KARESI = 12;
const EN_KISA_SN = 8;
const EN_UZUN_SN = 60;

function sureHesapla(kareSayisi: number): number {
  if (kareSayisi <= 1) return EN_KISA_SN;
  const ham = kareSayisi / SANIYEDE_VERI_KARESI;
  return Math.round(Math.min(EN_UZUN_SN, Math.max(EN_KISA_SN, ham)));
}

/** Süre seçenekleri. "auto" veriden hesaplanır, diğerleri sabit saniye. */
const SURELER: Array<{ deger: string; etiket: string }> = [
  { deger: "auto", etiket: "Oto" },
  { deger: "10", etiket: "10 sn" },
  { deger: "20", etiket: "20 sn" },
  { deger: "30", etiket: "30 sn" },
  { deger: "60", etiket: "60 sn" },
];

/** Kaç dakikada bir kare alınacağı. Kısa geçmişte ince kova daha çok kare verir. */
const DILIMLER: Array<{ deger: VoteHistoryBucket; etiket: string; ms: number }> = [
  { deger: "5min", etiket: "5 dk", ms: 300_000 },
  { deger: "10min", etiket: "10 dk", ms: 600_000 },
  { deger: "30min", etiket: "30 dk", ms: 1_800_000 },
  { deger: "hour", etiket: "1 saat", ms: 3_600_000 },
  { deger: "day", etiket: "1 gün", ms: 86_400_000 },
];

/**
 * Çizim hızı. Veri kovaları seyrek olsa da aradaki kareler üretiliyor.
 *
 * 25 DEĞİL, 30.
 *
 * Ekran çoğunlukla 60 Hz: 30 kare/sn tam bölüyor, her ikinci tazelemede bir
 * kare düşüyor ve aralık eşit kalıyor. 25 istendiğinde ise 60 Hz'de kareler
 * 40 ms'e denk gelmiyor, en yakın tazelemeye kayıyor — gerçekte 20 kare/sn'ye
 * düşüyor ve aralıklar düzensiz oluyordu. Görüntünün "kare kare" akmasının
 * bir sebebi buydu; diğeri arka planın her karede yeniden çizilmesiydi
 * (bkz. timelapseRenderer: arkaPlanKatmani).
 */
const KARE_HIZI = 30;

/**
 * Video sonunda son kare bu kadar duruyor; ani kesme kötü duruyor.
 * Bu süre TOPLAM sürenin içinde: "20 sn" seçen 20 saniyelik dosya alıyor.
 * Kartlar kapalıyken bitiş yalnızca bu duraklamadır.
 */
const BITIS_DURAKLAMA_MS = 1200;

/** Açılış kartının süresi (kartlar açıkken). */
const GIRIS_KARTI_MS = 1400;

/** Kapanış kartının süresi (kartlar açıkken). */
const BITIS_KARTI_MS = 1600;

/**
 * İlerleme çubuğu bu sıklıkta güncelleniyor.
 *
 * Her güncelleme React'i baştan çalıştırıyor; kayıt sırasında bu, çizime
 * ayrılan zamandan çalıyor. Göz için 200 ms fazlasıyla yeterli.
 */
const ILERLEME_BILDIRIM_MS = 200;

/**
 * Hazırlanan videonun gerçek süresi.
 *
 * İstenen süre bir bütçe; kaydı yapan tarayıcı kareleri gerçek zamanda
 * yakaladığı için yavaş bir cihazda video istenenden kısa çıkabiliyor.
 * Kullanıcı bunu ancak dosyayı açınca fark ederdi — ölçüp söylüyoruz.
 */
async function videoSuresi(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    // Ölçüm kendi geçici adresini kullanıyor: indirme bağlantısının adresini
    // ödünç alıp sonra kapatmak, Safari'de indirmeyi bozuyordu.
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    let bitti = false;
    const bitir = (d: number | null) => {
      if (bitti) return;
      bitti = true;
      v.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(d && Number.isFinite(d) && d > 0 ? d : null);
    };
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) return bitir(v.duration);
      // WebM'de süre çoğu zaman Infinity geliyor; sona sarınca yerine oturuyor.
      v.ontimeupdate = () => {
        v.ontimeupdate = null;
        bitir(v.duration);
      };
      v.currentTime = 1e6;
    };
    v.onerror = () => bitir(null);
    window.setTimeout(() => bitir(null), 6000);
    v.src = url;
  });
}

/** MediaRecorder'ın bu tarayıcıda desteklediği ilk biçim. */
function kayitBicimi(): { mime: string; kap: string; uzanti: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const adaylar: Array<{ mime: string; kap: string; uzanti: string }> = [
    { mime: "video/mp4;codecs=avc1", kap: "video/mp4", uzanti: "mp4" },
    { mime: "video/mp4", kap: "video/mp4", uzanti: "mp4" },
    { mime: "video/webm;codecs=vp9", kap: "video/webm", uzanti: "webm" },
    { mime: "video/webm;codecs=vp8", kap: "video/webm", uzanti: "webm" },
    { mime: "video/webm", kap: "video/webm", uzanti: "webm" },
  ];
  return adaylar.find((a) => MediaRecorder.isTypeSupported(a.mime)) ?? null;
}

/** Cihaz dosya paylaşımını destekliyor mu (iOS'ta indirme yerine bu kullanılıyor). */
function paylasimDesteginiOlc(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.canShare !== "function" || typeof nav.share !== "function") return false;
  try {
    return nav.canShare({ files: [new File([new Uint8Array(1)], "a.mp4", { type: "video/mp4" })] });
  } catch {
    return false;
  }
}

/** Dosyayı tarayıcının indirme akışıyla kaydeder (paylaşım olmayan yolların ortak alt yarısı). */
function indirmeyiBaslat(blob: Blob, ad: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ad;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // İndirme başlamadan adresi kapatmak dosyayı bozuyor; tarayıcıya süre tanı.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Dosyayı cihaza kaydet — video da fotoğraf da buradan geçiyor.
 *
 * iOS Safari `<a download>` başlığını blob adreslerinde yok sayıyor: bağlantıya
 * dokununca dosyayı indirmek yerine adrese gidiyor, bu da boş bir sayfa ya da
 * "WebKitBlobResource" hatası oluyor. Orada tek güvenilir yol paylaşım sayfası
 * — kullanıcı dosyayı Fotoğraflar'a ya da Dosyalar'a oradan kaydediyor.
 * Masaüstünde paylaşım yoksa klasik indirme bağlantısına düşüyoruz.
 */
async function dosyayiKaydet(blob: Blob, ad: string): Promise<"paylasildi" | "indirildi" | "iptal"> {
  const dosya = new File([blob], ad, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.canShare === "function" && nav.canShare({ files: [dosya] })) {
    try {
      await nav.share({ files: [dosya], title: "partim.lol zaman tüneli" });
      return "paylasildi";
    } catch (e) {
      // Kullanıcı paylaşım sayfasını kapattıysa hata değil.
      if (e instanceof DOMException && e.name === "AbortError") return "iptal";
      // Paylaşım başarısızsa indirmeyi dene.
    }
  }
  indirmeyiBaslat(blob, ad);
  return "indirildi";
}

/** Dosya adı için sadeleştirilmiş il adı: "İstanbul" -> "istanbul", "Çanakkale" -> "canakkale". */
const TURKCE_SLUG: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
function slug(ad: string): string {
  return ad
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (c) => TURKCE_SLUG[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Bir kareyi fotoğraf boyutunda (Full HD) bağımsız bir canvas'a çizip PNG yapar.
 *
 * Önizleme canvas'ına dokunmuyor: kayıt sırasında çizim akışını kesmemek için
 * fotoğraf kendi kanvasında üretiliyor. Kalite her zaman fullhd — video için
 * seçilen 720p/1080p ayarı fotoğrafı etkilemiyor.
 */
async function fotografUret(f: Frame, secenekler: CizimSecenekleri): Promise<Blob | null> {
  const kanvas = document.createElement("canvas");
  const { width, height } = BOYUTLAR.fullhd[secenekler.oran];
  kanvas.width = width;
  kanvas.height = height;
  const ctx = kanvas.getContext("2d");
  if (!ctx) return null;
  drawFrame(ctx, f, { ...secenekler, kalite: "fullhd" });
  return new Promise((coz) => kanvas.toBlob(coz, "image/png"));
}

/**
 * Zaman tüneli.
 *
 * Oy oranlarının ve haritanın zaman içindeki değişimini hızlandırılmış olarak
 * oynatır ve doğrudan video dosyası olarak kaydeder.
 *
 * Kayıt neden ekran kaydı değil: sayfayı ekrandan kaydetmek arayüzü, imleci ve
 * tarayıcı çerçevesini de içeri alır; çözünürlük de elde olmaz. Kareler
 * canvas'a çizildiği için `captureStream` ile tam istenen boyutta (16:9, 9:16,
 * 1:1) kaydedilebiliyor ve ekran paylaşımı izni gerekmiyor.
 */
export default function TimelapsePage() {
  const { backend, isDemo, totalVotes } = useGame();

  const [kaynak, setKaynak] = useState<Kaynak>(isDemo ? "ornek" : "gercek");
  /** Hangi haritanın tüneli: siyasi partiler ya da futbol takımları. */
  const [harita, setHarita] = useState<"siyasi" | "futbol">("siyasi");
  /** Video tarzı: klasik, son dakika, seçim gecesi, minimal. */
  const [stil, setStil] = useState<VideoStil>("son-dakika");
  /** Kapak yazısı — boşsa tarza göre otomatik. */
  const [hookMetni, setHookMetni] = useState("");
  /** Giriş & bitiş kartları çizilsin mi? */
  const [kartlar, setKartlar] = useState(true);
  const [oran, setOran] = useState<Oran>("16:9");
  const [kalite, setKalite] = useState<Kalite>("hd");
  const [cozunurluk, setCozunurluk] = useState<VoteHistoryBucket>("10min");
  /** "auto" ya da saniye cinsinden bir sayı. */
  const [sureSecimi, setSureSecimi] = useState<string>("auto");
  const [history, setHistory] = useState<VoteHistory | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [oynuyor, setOynuyor] = useState(false);
  /** 0–1 arası ilerleme. Kare sayısından bağımsız: süre neyse ona yayılıyor. */
  const [ilerleme, setIlerleme] = useState(0);
  const [kaydediyor, setKaydediyor] = useState(false);
  /**
   * Hazır video. Geçici adres (blob:) yerine dosyanın kendisi tutuluyor —
   * adres bir kez kapatılınca (revoke) geri gelmiyor ve indirme "WebKitBlobResource"
   * hatası veriyordu. Adresi artık yalnızca kaydetme anında, o an için üretiyoruz.
   */
  const [video, setVideo] = useState<{ blob: Blob; uzanti: string; sure: number | null } | null>(
    null,
  );
  const [kaydedildi, setKaydedildi] = useState<"paylasildi" | "indirildi" | null>(null);
  /** Fotoğraf (tek kare) kaydedildi mi? Video kaydından ayrı tutuluyor. */
  const [fotografKaydedildi, setFotografKaydedildi] = useState<"paylasildi" | "indirildi" | null>(
    null,
  );
  /** "Tüm illeri indir" toplu kaydı çalışıyor mu? */
  const [tumleriKaydediyor, setTumleriKaydediyor] = useState(false);
  /** Toplu kaydın sonuç mesajı (kaç fotoğraf, nereye yazıldı). */
  const [tumleriSonuc, setTumleriSonuc] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const paylasimVar = useMemo(paylasimDesteginiOlc, []);
  /** Sosyal medya güvenli alan kılavuzu — yalnızca önizlemede, kayda girmiyor. */
  const [kilavuz, setKilavuz] = useState(false);
  /** Kapsam: boş ise Türkiye geneli, doluysa tek il. */
  const [odakIl, setOdakIl] = useState("");
  const odakAdi = odakIl ? (PROVINCE_BY_ID[odakIl]?.name ?? null) : null;
  const pay = guvenliPay(oran);
  /** Kartlar açıkken giriş/bitiş süreleri — toplam sürenin içinden ayrılır. */
  const girisMs = kartlar ? GIRIS_KARTI_MS : 0;
  const bitisMs = kartlar ? BITIS_KARTI_MS : BITIS_DURAKLAMA_MS;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);

  /*
   * Çizim ve kare üretimi ref üzerinden okunuyor.
   *
   * Oynatma döngüsü bunları bağımlılık olarak alsaydı, kimliği değişen her
   * fonksiyonda effect yeniden kurulur ve BAŞLANGIÇ ZAMANI SIFIRLANIRDI —
   * 10 saniyelik video 29 saniye sürüyordu, sebebi buydu.
   */
  const cizRef = useRef<(s: Sahne | null, ekstra?: Partial<CizimSecenekleri>) => void>(
    () => undefined,
  );
  const sahneRef = useRef<(oran: number) => Sahne | null>(() => null);
  const ilerlemeRef = useRef(0);

  /* ------------------------------- veri ---------------------------------- */

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setHata(null);

    const kova = DILIMLER.find((c) => c.deger === cozunurluk) ?? DILIMLER[1];

    const yukle = async () => {
      if (kaynak === "ornek") {
        const gercek = await backend.getVoteHistory(cozunurluk, harita).catch(() => null);
        // Örnek akış gerçek açılış tablosunun üstüne biniyor: video haritanın
        // gerçek başlangıç hâlinden yola çıksın. Kova aralığı seçilen
        // çözünürlükle aynı olmalı, yoksa tarih etiketi tutmuyor.
        const oyuncular = harita === "futbol" ? FOOTBALL_TEAMS.map((t) => t.id) : undefined;
        return {
          ...syntheticHistory({ bucketMs: kova.ms, buckets: 72, votesPerBucket: 90, entityIds: oyuncular }),
          seed: gercek?.seed ?? {},
        };
      }
      return backend.getVoteHistory(cozunurluk, harita);
    };

    void yukle()
      .then((next) => {
        if (iptal) return;
        setHistory(next);
        setIlerleme(0);
      })
      .catch((err) => {
        if (!iptal) setHata(err instanceof Error ? err.message : "Geçmiş okunamadı.");
      })
      .finally(() => !iptal && setYukleniyor(false));

    return () => {
      iptal = true;
    };
  }, [backend, kaynak, cozunurluk, harita]);

  const frames: Frame[] = useMemo(() => (history ? buildFrames(history) : []), [history]);

  /** Video süresi: seçiliyse o, değilse veri miktarına göre. */
  const sureSn = useMemo(
    () => (sureSecimi === "auto" ? sureHesapla(frames.length) : Number(sureSecimi)),
    [sureSecimi, frames.length],
  );

  /**
   * Akıcılık ölçüsü: çizilen her karede kaç veri kovası geçiyor?
   *
   * 1'in altında kalırsa her kova en az bir kare görünüyor ve hareket
   * süzülerek akıyor. Üstüne çıkınca kovalar atlanmaya başlıyor — sayılar
   * sıçrıyor, haritada birçok il aynı anda renk değiştiriyor. Kullanıcı bunu
   * ancak videoyu izleyince fark ederdi; söylüyoruz.
   */
  const kareBasinaKova = frames.length > 1 ? (frames.length - 1) / (sureSn * KARE_HIZI) : 0;
  const sicramaVar = kareBasinaKova > 1.2;

  /*
   * DEVİR KAYDI
   *
   * Hangi veri karesinde hangi il rengini değiştirdi? Video oynatılırken bu
   * liste "şu an hangi iller parlasın, manşete hangi devir çıksın" sorusunu
   * yanıtlıyor. Parlama penceresi video süresine göre ~450 ms: ilin çevresi
   * beyaz çizgiyle vurgulanıyor, göz tam o anı yakalıyor.
   */
  type DevirKaydi = { il: string; at: number; enBuyuk: DevirBilgisi["enBuyuk"] };
  const devirler = useMemo<DevirKaydi[]>(() => {
    const bilgi = devirHaritasi(frames);
    const liste: DevirKaydi[] = [];
    bilgi.forEach((b, i) => {
      for (const il of b.degisen) liste.push({ il, at: i, enBuyuk: b.enBuyuk });
    });
    return liste;
  }, [frames]);

  /** Çizilecek kare + o anın sahne bilgisi (parlayan iller, manşet devri). */
  type Sahne = { f: Frame; degisen: string[]; enBuyuk: DevirBilgisi["enBuyuk"] | null };

  /**
   * O anki kare. İlerleme kesirli olduğu için iki veri karesinin arası
   * doldurulur — böylece kaç kova olursa olsun görüntü akıcı kalıyor.
   */
  const sahneUret = useCallback(
    (oran: number): Sahne | null => {
      if (frames.length === 0) return null;
      let f: Frame;
      if (frames.length === 1) {
        f = frames[0];
      } else {
        const konum = Math.max(0, Math.min(1, oran)) * (frames.length - 1);
        const i = Math.min(frames.length - 2, Math.floor(konum));
        f = lerpFrame(frames[i], frames[i + 1], konum - i);
      }
      // Kapsam daraltması en sonda: harita ve iller olduğu gibi kalıyor,
      // yalnızca tablo ile sayaç seçilen ilin sonuçlarına dönüyor.
      if (odakIl) f = scopeFrame(f, odakIl);

      // Parlama penceresi ~450 ms; gövde süresine oranlanıyor.
      const hareketMs = Math.max(1000, sureSn * 1000 - girisMs - bitisMs);
      const span = Math.max(0.15, ((frames.length - 1) * 0.45) / Math.max(1, hareketMs / 1000));
      const konum = Math.max(0, Math.min(1, oran)) * (frames.length - 1);
      const gecerli = devirler.filter((d) => d.at > konum - span - 0.5 && d.at <= konum + 0.5);
      const degisen = [...new Set(gecerli.map((d) => d.il))];
      let enBuyuk: DevirBilgisi["enBuyuk"] | null = null;
      let enSon = -Infinity;
      for (const d of gecerli) {
        if (d.enBuyuk && d.at > enSon) {
          enSon = d.at;
          enBuyuk = d.enBuyuk;
        }
      }
      return { f, degisen, enBuyuk };
    },
    [frames, odakIl, devirler, sureSn, girisMs, bitisMs],
  );

  /* ------------------------------- çizim --------------------------------- */

  /**
   * Kapak yazısı: kullanıcı girmediyse tarza göre; il seçiliyse ile göre.
   * Açılış kartında ve "Son Dakika" manşet bandında kullanılıyor.
   */
  const etkinHook = useMemo(() => {
    const ozel = hookMetni.trim();
    if (ozel) return ozel;
    if (odakAdi) return `${odakAdi.toLocaleUpperCase("tr")} BÖYLE DEĞİŞTİ`;
    return STILLER[stil].varsayilanHook;
  }, [hookMetni, odakAdi, stil]);

  /**
   * Çizim seçenekleri — önizleme ve fotoğraf aynı görünümü paylaşsın diye tek
   * yerden geliyor. Fotoğraf yalnızca kaliteyi fullhd'ye sabitliyor.
   */
  const cizimSecenekleri = useCallback(
    (): CizimSecenekleri => ({
      oran,
      kalite,
      ornek: kaynak === "ornek",
      odakProvinceId: odakIl || null,
      odakAdi,
      kaynak: harita === "futbol" ? FUTBOL_KAYNAK : SIYASI_KAYNAK,
      stil,
      hookMetni: etkinHook,
    }),
    [oran, kalite, kaynak, harita, odakIl, odakAdi, stil, etkinHook],
  );

  const ciz = useCallback(
    (s: Sahne | null, ekstra?: Partial<CizimSecenekleri>) => {
      const canvas = canvasRef.current;
      if (!canvas || !s) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawFrame(ctx, s.f, {
        ...cizimSecenekleri(),
        degisenIller: s.degisen,
        enBuyukDevir: s.enBuyuk,
        ...ekstra,
      });
    },
    [cizimSecenekleri],
  );

  // Döngünün okuduğu güncel referanslar (bkz. cizRef tanımı).
  cizRef.current = ciz;
  sahneRef.current = sahneUret;
  ilerlemeRef.current = ilerleme;

  /*
   * Canvas ölçüsü yalnızca ölçü/kalite değişince ayarlanmalı.
   *
   * Bağımlılıkta `frame` vardı: her karede canvas.width yeniden atanıyordu.
   * Bu, canvas'ı sıfırlayan ve bağlamı baştan kuran pahalı bir işlem —
   * saniyede sekiz kez yapılınca hem çizim yavaşlıyor hem kayıt akışı
   * kesiliyordu.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = BOYUTLAR[kalite][oran];
    canvas.width = width;
    canvas.height = height;
    cizRef.current(sahneRef.current(ilerlemeRef.current));
    // ilerleme bilerek bağımlılıkta değil: ölçü değişimine tepki veriyoruz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oran, kalite]);

  // Oynatma dışındayken (slider, ölçü değişimi) çizimi buradan tazeliyoruz;
  // oynatma sırasında kareyi döngünün kendisi çiziyor.
  useEffect(() => {
    if (oynuyor) return;
    ciz(sahneUret(ilerleme));
  }, [sahneUret, ilerleme, ciz, oynuyor]);

  /* ------------------------------ oynatma -------------------------------- */

  /*
   * Oynatma gerçek saate bağlı, kare sayısına değil.
   *
   * Eskiden "kare başına şu kadar milisaniye" diye ilerliyordu; süre kaç kova
   * olduğuna göre değişiyordu ve videonun kaç saniye olacağı önceden belli
   * değildi. Şimdi seçilen süre bir bütçe: geçen zamanın o süreye oranı
   * doğrudan ilerleme oluyor. 15 saniye seçildiyse video 15 saniye sürüyor —
   * veri ister 8 kova olsun ister 400.
   *
   * Sonda kısa bir duraklama var: son kare bir anda kesilince video yarıda
   * kalmış gibi duruyor. Kartlar açıkken bu duraklama yerine kapanış kartı
   * beliriyor; başta da açılış kartı var. İkisi de toplam sürenin İÇİNDEN
   * ayrılıyor — seçilen süre neyse dosya o.
   */
  useEffect(() => {
    if (!oynuyor || frames.length === 0) return;
    const toplamMs = sureSn * 1000;
    // Giriş ve bitiş kartları toplamın içinden ayrılıyor: seçilen süre neyse dosya o.
    const hareketMs = Math.max(1000, toplamMs - girisMs - bitisMs);
    const kareAraligi = 1000 / KARE_HIZI;
    let baslangic: number | null = null;
    /*
     * Kare numarası SÜREDEN türetiliyor, "son çizimden şu kadar ms geçti mi"
     * diye değil.
     *
     * Eskisi her çizimde saati sıfırlıyordu: 60 Hz bir ekranda 40 ms'lik eşik
     * ancak ikinci tazelemede (50 ms) doluyor, yani 25 kare/sn istenirken
     * gerçekte 20 kare/sn çiziliyor ve aralıklar düzensiz oluyordu. Kare
     * numarasını doğrudan geçen süreden okuyunca kaymayan, eşit aralıklı bir
     * dizi çıkıyor; cihaz yetişemezse bir numara atlanıyor ama kareler yine
     * doğru ana denk geliyor — video yavaşlamıyor, yalnızca seyrekleşiyor.
     */
    let sonKareNo = -1;
    let sonBildirim = -Infinity;

    /*
     * Yarım milimetrelik pay.
     *
     * 60 Hz bir ekranda tazelemeler 16,6667 ms aralıklı, kare sınırları ise
     * 33,3333 ms: her ikinci tazeleme sınırın TAM üstüne düşüyor ve kayan
     * nokta hatası yüzünden kimi zaman 0,99999 çıkıp kare atlanıyor. Sonuç,
     * ölçtüğümüz üzere 33,3 yerine 16,7 / 50 ms'lik düzensiz aralıklar —
     * yani gözle görülen titreme. Yarım milisaniyelik pay sınırı kesin
     * kılıyor; gerçek bir gecikmeyi maskeleyecek kadar büyük değil.
     */
    const PAY_MS = 0.5;

    const dongu = (now: number) => {
      baslangic ??= now;
      const gecen = now - baslangic;
      const kareNo = Math.floor((gecen + PAY_MS) / kareAraligi);

      if (kareNo > sonKareNo) {
        sonKareNo = kareNo;
        if (gecen < girisMs) {
          // Açılış kartı: ilk karenin üstünde, sonunda soldurarak haritayı açar.
          cizRef.current(sahneRef.current(0), {
            kart: "giris",
            kartIlerleme: girisMs > 0 ? gecen / girisMs : 1,
            zoom: 1.04,
          });
        } else if (kartlar && gecen >= girisMs + hareketMs) {
          // Kapanış kartı: son karenin üstünde, yavaşça belirir.
          const t = Math.min(1, (gecen - girisMs - hareketMs) / bitisMs);
          cizRef.current(sahneRef.current(1), { kart: "bitis", kartIlerleme: t, zoom: 1.06 });
        } else {
          // Gövde: harita akışı, hafif Ken Burns yakınlaşmasıyla.
          const oran = Math.min(1, (gecen - girisMs) / hareketMs);
          cizRef.current(sahneRef.current(oran), { zoom: 1 + 0.05 * oran });
        }
        // Slider'ı sık güncellemeye gerek yok; her tikte React'i yormayalım.
        if (now - sonBildirim >= ILERLEME_BILDIRIM_MS) {
          sonBildirim = now;
          setIlerleme(Math.min(1, gecen / toplamMs));
        }
      }

      if (gecen >= toplamMs) {
        setIlerleme(1);
        setOynuyor(false);
        return;
      }
      rafRef.current = requestAnimationFrame(dongu);
    };
    rafRef.current = requestAnimationFrame(dongu);
    return () => cancelAnimationFrame(rafRef.current);
  }, [oynuyor, sureSn, frames.length, girisMs, bitisMs, kartlar]);

  /* ------------------------------- kayıt --------------------------------- */

  // Oynatma bitince kaydı kapat.
  useEffect(() => {
    if (oynuyor || !kaydediyor) return;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, [oynuyor, kaydediyor]);

  const kaydet = useCallback(() => {
    const canvas = canvasRef.current;
    const bicim = kayitBicimi();
    if (!canvas || frames.length === 0) return;
    if (!bicim) {
      setHata(
        "Bu tarayıcı video kaydını desteklemiyor. Chrome ya da Safari'nin güncel sürümünü deneyin; " +
          "alternatif olarak videoyu telefonun ekran kaydıyla alabilirsiniz.",
      );
      return;
    }

    setHata(null);
    setVideo(null);
    setKaydedildi(null);

    const stream = canvas.captureStream(KARE_HIZI);
    const parcalar: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: bicim.mime,
      videoBitsPerSecond: 8_000_000,
    });
    recorder.ondataavailable = (e) => e.data.size > 0 && parcalar.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      // Kap tipi sade tutuluyor: Safari, ";codecs=" ekli tipteki dosyayı
      // oynatılabilir bir video olarak tanımıyor.
      const blob = new Blob(parcalar, { type: bicim.kap });
      setVideo({ blob, uzanti: bicim.uzanti, sure: null });
      setKaydediyor(false);
      recorderRef.current = null;
      void videoSuresi(blob).then((sure) =>
        setVideo((onceki) => (onceki && onceki.blob === blob ? { ...onceki, sure } : onceki)),
      );
    };
    recorderRef.current = recorder;

    setIlerleme(0);
    setKaydediyor(true);
    recorder.start();
    setOynuyor(true);
  }, [frames.length]);

  const indir = useCallback(async () => {
    if (!video) return;
    setHata(null);
    try {
      const sonuc = await dosyayiKaydet(video.blob, `partim-lol-zaman-tuneli.${video.uzanti}`);
      if (sonuc !== "iptal") setKaydedildi(sonuc);
    } catch {
      setHata(
        "Video kaydedilemedi. Sayfayı yenilemeden tekrar deneyin; " +
          "sorun sürerse videoyu yeniden oluşturun.",
      );
    }
  }, [video]);

  /**
   * O anki kareyi fotoğraf olarak indir — seçili kapsamla (Türkiye geneli ya
   * da tek il). Önizlemede ne görünüyorsa o çıkıyor: kaydırıcının zamanı,
   * harita seçimi ve kapsam hepsi aynen yansıyor.
   */
  const fotografIndir = useCallback(async () => {
    const s = sahneRef.current(ilerlemeRef.current);
    if (!s) return;
    setOynuyor(false);
    setHata(null);
    setFotografKaydedildi(null);
    try {
      const blob = await fotografUret(s.f, cizimSecenekleri());
      if (!blob) throw new Error("Fotoğraf üretilemedi.");
      const ad = odakAdi ? slug(odakAdi) : "turkiye";
      const sonuc = await dosyayiKaydet(blob, `partim-lol-${ad}.png`);
      if (sonuc !== "iptal") setFotografKaydedildi(sonuc);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Fotoğraf kaydedilemedi.");
    }
  }, [cizimSecenekleri, odakAdi]);

  /**
   * Türkiye geneli + 81 ilin tamamı için o anki kareyi ayrı ayrı fotoğraflar.
   *
   * Chromium/Edge klasör seçtirip dosyaları oraya yazar; diğer tarayıcılarda
   * kısa aralıklarla indirme başlatılır. 82 dosya birden isteyince tarayıcı
   * çoklu indirmeyi engelleyebilir — sonuç mesajında söyleniyor.
   */
  const tumIlleriKaydet = useCallback(async () => {
    const s = sahneRef.current(ilerlemeRef.current);
    if (!s || tumleriKaydediyor) return;
    setOynuyor(false);
    setHata(null);
    setTumleriSonuc(null);

    const secenekler = cizimSecenekleri();
    const kapsamlar: Array<{ id: string | null; ad: string }> = [
      { id: null, ad: "turkiye" },
      ...PROVINCES.map((p) => ({ id: p.id, ad: slug(p.name) })),
    ];
    const dosyaAdi = (k: (typeof kapsamlar)[number]) => `partim-lol-${k.ad}.png`;

    setTumleriKaydediyor(true);
    try {
      const pencerem = window as unknown as {
        showDirectoryPicker?: () => Promise<{
          getFileHandle: (
            ad: string,
            secenek: { create: boolean },
          ) => Promise<{
            createWritable: () => Promise<{
              write: (veri: Blob) => Promise<void>;
              close: () => Promise<void>;
            }>;
          }>;
        }>;
      };
      const secici = pencerem.showDirectoryPicker;

      /*
       * Klasör seçimi işin EN BAŞINDA isteniyor: geçerli bir kullanıcı
       * hareketi gerektiriyor, 82 kare üretildikten sonra sorulursa izin düşer.
       */
      if (typeof secici === "function") {
        const klasor = await secici();
        for (const k of kapsamlar) {
          const kare = k.id ? scopeFrame(s.f, k.id) : s.f;
          const blob = await fotografUret(kare, {
            ...secenekler,
            odakProvinceId: k.id,
            odakAdi: k.id ? (PROVINCE_BY_ID[k.id]?.name ?? null) : null,
          });
          if (!blob) continue;
          const dosya = await klasor.getFileHandle(dosyaAdi(k), { create: true });
          const yazici = await dosya.createWritable();
          await yazici.write(blob);
          await yazici.close();
        }
        setTumleriSonuc(`${kapsamlar.length} fotoğraf klasöre yazıldı.`);
        return;
      }

      // Klasör seçimi yok: sırayla indir.
      let kaydedilen = 0;
      for (const k of kapsamlar) {
        const kare = k.id ? scopeFrame(s.f, k.id) : s.f;
        const blob = await fotografUret(kare, {
          ...secenekler,
          odakProvinceId: k.id,
          odakAdi: k.id ? (PROVINCE_BY_ID[k.id]?.name ?? null) : null,
        });
        if (!blob) continue;
        indirmeyiBaslat(blob, dosyaAdi(k));
        kaydedilen += 1;
        // İndirmeleri tek tek başlatmak, tarayıcının "çoklu indirme" korumasını
        // tetikleme şansını artırıyor; küçük bir boşluk bırakıyoruz.
        await new Promise((r) => window.setTimeout(r, 400));
      }
      setTumleriSonuc(
        kaydedilen > 0
          ? `${kaydedilen} fotoğraf için indirme başlatıldı. Tarayıcı çoklu indirmeyi engellediyse izin verin; Chrome/Edge'de "Tüm illeri indir" bunun yerine doğrudan klasöre yazar.`
          : "Fotoğraflar üretilemedi.",
      );
    } catch (e) {
      // Kullanıcı klasör seçimini kapattıysa hata değil.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setHata(e instanceof Error ? e.message : "Fotoğraflar kaydedilemedi.");
    } finally {
      setTumleriKaydediyor(false);
    }
  }, [cizimSecenekleri, tumleriKaydediyor]);

  /** Reels hazır ayarı: dikey, kısa, haber kuşağı. */
  const reelsAyar = useCallback(() => {
    setOynuyor(false);
    setOran("9:16");
    setSureSecimi("15");
    setStil("son-dakika");
    setKalite("hd");
    setKartlar(true);
  }, []);

  /** X hazır ayarı: yatay, orta uzunlukta, canlı yayın. */
  const xAyar = useCallback(() => {
    setOynuyor(false);
    setOran("16:9");
    setSureSecimi("20");
    setStil("secim-gecesi");
    setKalite("hd");
    setKartlar(true);
  }, []);

  const kovaSayisi = frames.length;

  /*
   * SESSİZCE YANLIŞ OLMASIN.
   *
   * Videonun verisi (açılış tablosu + oy geçmişi) ile sitenin canlı sayacı ayrı
   * yollardan geliyor. Bir gün yeniden ayrışırlarsa — eksik sayfa, bozuk
   * toplam — kullanıcı bunu ancak videoyu yayımladıktan sonra fark eder.
   * Karşılaştırıp söylüyoruz.
   */
  const videoToplami = frames.length > 0 ? frames[frames.length - 1].totalVotes : 0;
  const tutarsiz =
    kaynak === "gercek" && !yukleniyor && totalVotes > 0 && videoToplami !== totalVotes;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-3 sm:p-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Zaman tüneli</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Oy oranlarının ve haritanın zaman içindeki değişimi, hızlandırılmış olarak. Dört
          farklı tarzda doğrudan video dosyası üretip Reels, TikTok ve X'te paylaşabilirsin —
          ekran kaydı gerekmiyor, görüntü tam istediğin ölçüde çıkıyor. Açılış ve kapanış
          kartları, devir anlarında il parlaması ve manşet bandı videoyu viral kurguya
          hazırlar; istersen herhangi bir andaki haritayı, Türkiye geneli ya da tek bir il
          için, fotoğraf (PNG) olarak da indirebilirsin.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-center bg-black/40 p-3">
          <div
            className={cn(
              "relative w-full",
              oran === "9:16" && "max-w-[min(100%,360px)]",
              oran === "1:1" && "max-w-[min(100%,560px)]",
            )}
          >
            <canvas ref={canvasRef} className="block h-auto w-full rounded-xl" />

            {/*
             * Kılavuz yalnızca önizlemede: canvas'ın üstünde ayrı bir katman
             * olduğu için kayda girmiyor. Sosyal medyanın kendi arayüzünün
             * karenin neresini yiyeceğini gösteriyor.
             */}
            {kilavuz && (
              <div className="pointer-events-none absolute inset-0 rounded-xl">
                <div
                  className="absolute inset-x-0 top-0 bg-rose-500/15"
                  style={{ height: `${pay.ust * 100}%` }}
                />
                <div
                  className="absolute inset-x-0 bottom-0 bg-rose-500/15"
                  style={{ height: `${pay.alt * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-rose-500/15"
                  style={{ width: `${pay.yan * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 right-0 bg-rose-500/15"
                  style={{ width: `${pay.yan * 100}%` }}
                />
                <div
                  className="absolute rounded-sm border border-dashed border-emerald-400/70"
                  style={{
                    top: `${pay.ust * 100}%`,
                    bottom: `${pay.alt * 100}%`,
                    left: `${pay.yan * 100}%`,
                    right: `${pay.yan * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 p-4">
          {yukleniyor ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    if (ilerleme >= 1) setIlerleme(0);
                    setOynuyor((v) => !v);
                  }}
                  disabled={frames.length === 0 || kaydediyor}
                >
                  {oynuyor ? <Pause /> : <Play />}
                  {oynuyor ? "Duraklat" : "Oynat"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOynuyor(false);
                    setIlerleme(0);
                  }}
                  disabled={kaydediyor}
                >
                  <RotateCcw />
                  Başa sar
                </Button>

                <Button variant="secondary" onClick={kaydet} disabled={kaydediyor || frames.length === 0}>
                  {kaydediyor ? <Loader2 className="animate-spin" /> : <Video />}
                  {kaydediyor ? "Kaydediliyor…" : "Video oluştur"}
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => void fotografIndir()}
                  disabled={kaydediyor || tumleriKaydediyor || frames.length === 0}
                >
                  <ImageDown />
                  {paylasimVar ? "Fotoğrafı kaydet" : "Fotoğraf indir"}
                </Button>

                {video && (
                  <Button variant="primary" onClick={() => void indir()}>
                    <Download />
                    {paylasimVar ? "Videoyu kaydet" : "Videoyu indir"}
                  </Button>
                )}
              </div>

              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(ilerleme * 1000)}
                onChange={(e) => {
                  setOynuyor(false);
                  setIlerleme(Number(e.target.value) / 1000);
                }}
                disabled={kaydediyor}
                aria-label="Zaman"
                className="w-full accent-primary"
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <Secim
                  baslik="Harita"
                  secenekler={[
                    { deger: "siyasi", etiket: "Partiler" },
                    { deger: "futbol", etiket: "Futbol" },
                  ]}
                  secili={harita}
                  onSec={(v) => {
                    setOynuyor(false);
                    setHarita(v as "siyasi" | "futbol");
                  }}
                  kilitli={kaydediyor}
                />
                <Secim
                  baslik="Kaynak"
                  secenekler={[
                    { deger: "gercek", etiket: "Gerçek oylar" },
                    { deger: "ornek", etiket: "Örnek akış" },
                  ]}
                  secili={kaynak}
                  onSec={(v) => {
                    setOynuyor(false);
                    setKaynak(v as Kaynak);
                  }}
                  kilitli={kaydediyor}
                />
                <Secim
                  baslik="Ölçü"
                  secenekler={[
                    { deger: "16:9", etiket: "16:9" },
                    { deger: "1.91:1", etiket: "1.91" },
                    { deger: "9:16", etiket: "9:16" },
                    { deger: "1:1", etiket: "1:1" },
                  ]}
                  secili={oran}
                  onSec={(v) => setOran(v as Oran)}
                  kilitli={kaydediyor}
                />
                <Secim
                  baslik="Kalite"
                  secenekler={[
                    { deger: "hd", etiket: "720p" },
                    { deger: "fullhd", etiket: "1080p" },
                  ]}
                  secili={kalite}
                  onSec={(v) => setKalite(v as Kalite)}
                  kilitli={kaydediyor}
                />
                <Secim
                  baslik="Zaman dilimi"
                  secenekler={DILIMLER.map((c) => ({ deger: c.deger, etiket: c.etiket }))}
                  secili={cozunurluk}
                  onSec={(v) => {
                    setOynuyor(false);
                    setCozunurluk(v as VoteHistoryBucket);
                  }}
                  kilitli={kaydediyor}
                />
                <Secim
                  baslik="Süre (sn)"
                  secenekler={SURELER}
                  secili={sureSecimi}
                  onSec={(v) => {
                    setOynuyor(false);
                    setSureSecimi(v);
                  }}
                  kilitli={kaydediyor}
                />
              </div>

              <StilSecici
                secili={stil}
                onSec={(v) => {
                  setOynuyor(false);
                  setStil(v);
                }}
                kilitli={kaydediyor}
              />

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <span className="stat-label">Kapak yazısı</span>
                  <input
                    type="text"
                    value={hookMetni}
                    onChange={(e) => {
                      setHookMetni(e.target.value);
                      setOynuyor(false);
                    }}
                    maxLength={64}
                    disabled={kaydediyor}
                    placeholder={
                      odakAdi
                        ? `${odakAdi.toLocaleUpperCase("tr")} BÖYLE DEĞİŞTİ`
                        : STILLER[stil].varsayilanHook
                    }
                    className="mt-1.5 w-full rounded-xl border border-white/12 bg-[hsl(224_44%_8%)] px-3 py-2 text-sm font-semibold transition-colors hover:border-white/25 focus:border-white/40 focus:outline-none disabled:opacity-50"
                  />
                  <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Açılış kartındaki ve manşet bandındaki yazı. Boş bırakılırsa tarza (il
                    seçiliyse ile) göre otomatik yazılır.
                  </p>
                </div>
                <div className="flex flex-col items-start justify-end gap-2 pb-0.5 sm:items-end">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={kartlar}
                      onChange={(e) => setKartlar(e.target.checked)}
                      disabled={kaydediyor}
                    />
                    Giriş & bitiş kartları
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={reelsAyar}
                      disabled={kaydediyor}
                      title="9:16 · 15 sn · Son Dakika tarzı"
                    >
                      📱 Reels
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={xAyar}
                      disabled={kaydediyor}
                      title="16:9 · 20 sn · Seçim Gecesi tarzı"
                    >
                      🐦 X
                    </Button>
                  </div>
                </div>
              </div>

              {/*
                Kapsam 81 seçenek: düğme sırası olmaz, yerel açılır liste hem
                aramayı hem klavyeyi bedavaya getiriyor. Yanındaki düğme tek
                tek seçmeden hepsini fotoğraflıyor.
              */}
              <div className="space-y-1.5">
                <span className="stat-label">Kapsam</span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={odakIl}
                    onChange={(e) => {
                      setOynuyor(false);
                      setOdakIl(e.target.value);
                    }}
                    disabled={kaydediyor || tumleriKaydediyor}
                    className="min-w-0 flex-1 rounded-xl border border-white/12 bg-[hsl(224_44%_8%)] px-3 py-2 text-sm font-semibold transition-colors hover:border-white/25 focus:border-white/40 focus:outline-none disabled:opacity-50 sm:max-w-xs"
                  >
                    <option value="">Türkiye geneli</option>
                    {[...PROVINCES]
                      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {String(p.plate).padStart(2, "0")} · {p.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    variant="outline"
                    onClick={() => void tumIlleriKaydet()}
                    disabled={kaydediyor || tumleriKaydediyor || frames.length === 0}
                    title="Türkiye geneli ve 81 ilin tamamı için o anki haritayı ayrı ayrı fotoğraflar"
                  >
                    {tumleriKaydediyor ? <Loader2 className="animate-spin" /> : <Images />}
                    {tumleriKaydediyor ? "Hazırlanıyor…" : "Tüm illeri indir"}
                  </Button>
                </div>
                {tumleriSonuc && (
                  <p className="pt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {tumleriSonuc}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{kovaSayisi} veri karesi</Badge>
                {odakAdi && <Badge variant="secondary">{odakAdi}</Badge>}
                <Badge variant={sicramaVar ? "warning" : "secondary"}>
                  {sureSn} sn · {KARE_HIZI} kare/sn
                  {sureSecimi === "auto" && " · oto"}
                </Badge>
                <Badge variant="secondary">
                  {BOYUTLAR[kalite][oran].width}×{BOYUTLAR[kalite][oran].height}
                </Badge>
                {kaynak === "ornek" && (
                  <Badge variant="warning">örnek veri — gerçek sonuç değildir</Badge>
                )}
                <button
                  type="button"
                  onClick={() => setKilavuz((v) => !v)}
                  className="rounded-full border border-white/12 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
                >
                  {kilavuz ? "Güvenli alanı gizle" : "Güvenli alanı göster"}
                </button>
              </div>

              {kilavuz && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Kırmızı bantlar, videoyu sosyal medyaya yüklediğinde platformun kendi arayüzünün
                  (beğeni/yorum sütunu, açıklama metni, üstteki sekmeler) karenin üstüne bindiği
                  yerler. Yazılar ve harita yeşil çerçevenin içinde kalıyor — kılavuz yalnızca
                  önizlemede görünür, videoya girmez.
                </p>
              )}

              {sicramaVar && (
                <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[13px] leading-relaxed text-amber-200">
                  Bu ayarda çizilen her karede{" "}
                  <strong className="text-amber-100">{kareBasinaKova.toFixed(1)} veri karesi</strong>{" "}
                  geçiyor: oylar sıçrayarak görünür. Akıcı olması için{" "}
                  <strong className="text-amber-100">Süre</strong>'yi uzat ya da{" "}
                  <strong className="text-amber-100">Zaman dilimi</strong>'ni büyüt (30 dk, 1 saat) —
                  ikisi de saniyede geçen kare sayısını düşürür.
                </p>
              )}

              {tutarsiz && (
                <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[13px] leading-relaxed text-amber-200">
                  Videodaki toplam ({formatNumber(videoToplami)} oy) sitedeki toplamla (
                  {formatNumber(totalVotes)} oy) tutmuyor. Oranlar da kayabilir — bu videoyu
                  yayımlamadan önce sayfayı yenile; sürerse veri kaynağında bir sorun var
                  demektir.
                </p>
              )}

              {kaynak === "gercek" && frames.length <= 1 && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Gerçek oy geçmişi henüz bir kareye sığıyor: oyun yeni açıldı. Oylar biriktikçe
                  bu video kendiliğinden uzuyor. Şimdiden tanıtım videosu çekmek için
                  <strong className="text-foreground"> Örnek akış</strong> kaynağını seç — o
                  videoya "örnek veri" damgası basılır.
                </p>
              )}

              {video?.sure != null && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {Math.abs(video.sure - sureSn) <= Math.max(1, sureSn * 0.12) ? (
                    <>
                      Video <strong className="text-foreground">{video.sure.toFixed(1)} sn</strong>{" "}
                      olarak hazır.
                    </>
                  ) : (
                    <>
                      Video <strong className="text-amber-300">{video.sure.toFixed(1)} sn</strong>{" "}
                      çıktı, oysa {sureSn} sn istendi: cihaz çizime yetişemedi. Kaliteyi 720p yapıp
                      ya da başka sekmeleri kapatıp tekrar dene.
                    </>
                  )}
                </p>
              )}

              {kaydedildi === "paylasildi" && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Video paylaşım sayfasına gönderildi —{" "}
                  <strong className="text-foreground">Videoyu Kaydet</strong> ile Fotoğraflar'a,{" "}
                  <strong className="text-foreground">Dosyalara Kaydet</strong> ile Dosyalar'a
                  alabilirsin.
                </p>
              )}
              {kaydedildi === "indirildi" && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Video indirilenler klasörüne kaydedildi.
                </p>
              )}

              {fotografKaydedildi === "paylasildi" && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Fotoğraf paylaşım sayfasına gönderildi —{" "}
                  <strong className="text-foreground">Fotoğrafı Kaydet</strong> ile Fotoğraflar'a
                  alabilirsin.
                </p>
              )}
              {fotografKaydedildi === "indirildi" && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Fotoğraf indirilenler klasörüne kaydedildi.
                </p>
              )}

              {hata && <p className="text-[13px] leading-relaxed text-amber-300">{hata}</p>}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function Secim({
  baslik,
  secenekler,
  secili,
  onSec,
  kilitli,
}: {
  baslik: string;
  secenekler: Array<{ deger: string; etiket: string }>;
  secili: string;
  onSec: (deger: string) => void;
  kilitli?: boolean;
}) {
  return (
    <div>
      <span className="stat-label">{baslik}</span>
      <div className="mt-1.5 flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
        {secenekler.map((s) => (
          <button
            key={s.deger}
            type="button"
            disabled={kilitli}
            onClick={() => onSec(s.deger)}
            className={cn(
              "flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
              /*
               * Dört ve üzeri seçenekte yatay boşluk kısılıyor.
               *
               * Beş sütunlu ızgarada bir hücre ~190 piksel; dört düğme
               * varsayılan iç boşlukla oraya sığmıyor ve satır hücreden
               * taşıyordu. Metin kısalmıyor, yalnızca payı daralıyor.
               */
              secenekler.length >= 4 ? "px-1" : "px-2",
              secili === s.deger
                ? "bg-white/[0.12] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.etiket}
          </button>
        ))}
      </div>
    </div>
  );
}

function StilSecici({
  secili,
  onSec,
  kilitli,
}: {
  secili: VideoStil;
  onSec: (deger: VideoStil) => void;
  kilitli?: boolean;
}) {
  return (
    <div>
      <span className="stat-label">Tarz</span>
      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STIL_LIST.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={kilitli}
            onClick={() => onSec(s.id)}
            className={cn(
              "rounded-xl border p-2.5 text-left transition-colors disabled:opacity-50",
              secili === s.id
                ? "border-primary/60 bg-primary/10"
                : "border-white/[0.08] bg-white/[0.03] hover:border-white/25",
            )}
          >
            <span className="flex items-center gap-1.5">
              <span className="text-base leading-none">{s.ikon}</span>
              <span className="text-xs font-bold">{s.etiket}</span>
            </span>
            <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
              {s.aciklama}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
