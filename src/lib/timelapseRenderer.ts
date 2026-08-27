/**
 * Zaman tünelini bir <canvas>'a çizer.
 *
 * NEDEN CANVAS, EKRAN KAYDI DEĞİL
 *
 * Tanıtım videosu istendi. Sayfayı ekran kaydıyla almak arayüzü, imleci ve
 * tarayıcı çerçevesini de içeri alıyor; telefonda çözünürlük de elde değil.
 * Canvas'a çizince kare tam olarak istenen boyutta (16:9, 9:16, 1:1) çıkıyor
 * ve `canvas.captureStream()` ile doğrudan video dosyasına kaydedilebiliyor —
 * ekran paylaşımı izni gerekmiyor, iOS'ta da çalışıyor.
 *
 * İl yolları SVG'den yeniden çizilmiyor: `Path2D` doğrudan `d` metnini
 * anlıyor, yani haritanın aynı kaynağı (data/provinces.ts) burada da geçerli.
 *
 * VİRAL KURGU
 *
 * Video tek bir görünümden ibaret değil: başta tam ekran bir açılış kartı
 * (manşet), sonda kapanış kartı (partim.lol çağrısı), arada da harita akıyor.
 * Bir il el değiştirdiğinde o il bir süre parlayarak vurgulanıyor; "Son
 * Dakika" tarzında altta kırmızı bir manşet bandı akıyor ve en büyük devirin
 * adını yazıyor. Amaç: ilk iki saniyede izleyiciyi durdurmak, ortada dramayı
 * göstermek, sonda oyuna çağırmak.
 */
import { PARTY_BY_ID, partyColor, partyShortName } from "@/data/parties";
import {
  FOOTBALL_TEAM_BY_ID,
  teamColor,
  teamShortName,
} from "@/data/footballTeams";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";
import type { Frame } from "@/lib/timelapse";

/**
 * Harita türüne göre renk/ad kaynağı.
 *
 * Zaman tüneli hem siyasi partileri hem futbol takımlarını çizebiliyor; aradaki
 * tek fark renk ve adın nereden geldiği. Bu nesne o kaynağı taşır.
 */
export type HaritaKaynagi = {
  renk: (id: string | null | undefined) => string;
  kisaAd: (id: string | null | undefined) => string;
  tamAd: (id: string | null | undefined) => string;
  /** Rozet üstündeki yazının tonu ("dark" -> koyu yazı) */
  yaziTonu: (id: string | null | undefined) => "light" | "dark";
};

export const SIYASI_KAYNAK: HaritaKaynagi = {
  renk: partyColor,
  kisaAd: partyShortName,
  tamAd: (id) => (id ? PARTY_BY_ID[id]?.name ?? id : "Bilinmiyor"),
  yaziTonu: (id) => (id ? PARTY_BY_ID[id]?.on ?? "light" : "light"),
};

export const FUTBOL_KAYNAK: HaritaKaynagi = {
  renk: teamColor,
  kisaAd: teamShortName,
  tamAd: (id) => (id ? FOOTBALL_TEAM_BY_ID[id]?.name ?? id : "Bilinmiyor"),
  yaziTonu: (id) => (id ? FOOTBALL_TEAM_BY_ID[id]?.on ?? "light" : "light"),
};

/** provinces.ts ile aynı viewBox */
const W = 1000;
const H = 422.49;

const NEUTRAL = "#1b2436";
const TEXT = "#e8eef7";
const MUTED = "rgba(232,238,247,0.55)";

/**
 * Kayıt oranları.
 *
 * 1.91:1, X ve Meta'nın yatay reklam/bağlantı kartı ölçüsü. 16:9'dan biraz
 * daha basık; akışta kırpılmadan görünen en geniş kare bu.
 */
export type Oran = "16:9" | "1.91:1" | "9:16" | "1:1";

export type Kalite = "hd" | "fullhd";

/**
 * Kayıt ölçüleri.
 *
 * Varsayılan HD: video her karede baştan çiziliyor ve Full HD'de kare başına
 * iki kat piksel demek. Yavaş bir cihazda çizim kare hızına yetişemeyince
 * yakalanan kare sayısı düşüyor ve video istenenden kısa çıkıyor. Sosyal
 * medyada 720p zaten fazlasıyla yeterli; Full HD isteyen seçebiliyor.
 */
export const BOYUTLAR: Record<Kalite, Record<Oran, { width: number; height: number }>> = {
  hd: {
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 720, height: 1280 },
    "1:1": { width: 720, height: 720 },
    // 1200×628, platformların kendi yayımladığı ölçü (1,9108 — herkesin
    // "1.91:1" derken kastettiği sayı).
    "1.91:1": { width: 1200, height: 628 },
  },
  fullhd: {
    "16:9": { width: 1920, height: 1080 },
    "9:16": { width: 1080, height: 1920 },
    "1:1": { width: 1080, height: 1080 },
    // Tam 1,91 ve iki kenar da çift sayı (H.264 tek sayı boyut kabul etmiyor).
    "1.91:1": { width: 1910, height: 1000 },
  },
};

/* --------------------------- video tarzları ------------------------------ */

/**
 * Video tarzı.
 *
 * Aynı veri dört farklı "kuşak"ta çizilebiliyor: klasik veri görünümü, haber
 * kuşağı (Son Dakika), canlı yayın (Seçim Gecesi) ve sade tipografi
 * (Minimal). Fark palet, üst rozet, alt manşet bandı ve tablo yoğunluğu.
 */
export type VideoStil = "klasik" | "son-dakika" | "secim-gecesi" | "minimal";

export type StilTanim = {
  id: VideoStil;
  etiket: string;
  aciklama: string;
  ikon: string;
  bg: string;
  /** Arka plandaki radyal ışığın rengi. */
  glow: string;
  /** Vurgu rengi (manşet, rozet, çubuklar). */
  vurgu: string;
  /** Üst şeritte çizilecek rozet yazısı ("SON DAKİKA", "CANLI"); yoksa boş. */
  rozet: string | null;
  /** Altta manşet bandı çizilsin mi? */
  altBant: boolean;
  /** Tabloda gösterilecek satır sayısı. */
  tabloSatir: number;
  /** Kapak yazısı girilmediğinde kullanılacak varsayılan manşet. */
  varsayilanHook: string;
};

export const STILLER: Record<VideoStil, StilTanim> = {
  klasik: {
    id: "klasik",
    etiket: "Klasik",
    aciklama: "Harita + tablo, tanıdık görünüm",
    ikon: "🗺️",
    bg: "#060a12",
    glow: "rgba(34,211,238,0.16)",
    vurgu: "#22d3ee",
    rozet: null,
    altBant: false,
    tabloSatir: 7,
    varsayilanHook: "TÜRKİYE BÖYLE DEĞİŞTİ",
  },
  "son-dakika": {
    id: "son-dakika",
    etiket: "Son Dakika",
    aciklama: "Haber kuşağı: kırmızı bant, büyük manşet",
    ikon: "🚨",
    bg: "#12060b",
    glow: "rgba(239,68,68,0.2)",
    vurgu: "#ef4444",
    rozet: "SON DAKİKA",
    altBant: true,
    tabloSatir: 5,
    varsayilanHook: "TÜRKİYE BÖYLE OY VERDİ",
  },
  "secim-gecesi": {
    id: "secim-gecesi",
    etiket: "Seçim Gecesi",
    aciklama: "Canlı yayın: açılan sandık sayacı",
    ikon: "🗳️",
    bg: "#0a0716",
    glow: "rgba(139,92,246,0.2)",
    vurgu: "#a78bfa",
    rozet: "CANLI",
    altBant: false,
    tabloSatir: 7,
    varsayilanHook: "SEÇİM GECESİ — İLK SONUÇLAR",
  },
  minimal: {
    id: "minimal",
    etiket: "Minimal",
    aciklama: "Sade: büyük tipografi, az gürültü",
    ikon: "⬛",
    bg: "#04060b",
    glow: "rgba(148,163,184,0.1)",
    vurgu: "#e2e8f0",
    rozet: null,
    altBant: false,
    tabloSatir: 3,
    varsayilanHook: "TÜRKİYE DEĞİŞİYOR",
  },
};

/** Sıralı stil listesi — arayüz seçiciyi buradan kuruyor. */
export const STIL_LIST: StilTanim[] = Object.values(STILLER);

/**
 * Bir ilin sınır kutusu (viewBox koordinatı).
 *
 * Yollar yalnızca mutlak M/L/Z komutlarından oluşuyor (provinces.ts otomatik
 * üretiliyor), dolayısıyla `d` metnindeki bütün sayı çiftleri koordinat.
 * Path2D sınır kutusu vermediği için en kestirme yol bu.
 */
const kutular = new Map<string, { x: number; y: number; w: number; h: number }>();
function ilKutusu(provinceId: string) {
  const varolan = kutular.get(provinceId);
  if (varolan) return varolan;

  const province = PROVINCES.find((p) => p.id === provinceId);
  if (!province) return null;

  const sayilar = province.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < sayilar.length; i += 2) {
    const x = sayilar[i];
    const y = sayilar[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;

  const kutu = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  kutular.set(provinceId, kutu);
  return kutu;
}

/** `d` metinleri her karede yeniden ayrıştırılmasın diye bir kez kuruluyor. */
let yollar: Array<{ id: string; path: Path2D }> | null = null;
function provincePaths() {
  yollar ??= PROVINCES.map((province) => ({ id: province.id, path: new Path2D(province.d) }));
  return yollar;
}

function formatSayi(n: number): string {
  // Oy sayısı her zaman tam sayıdır; ara karelerde kesir kalırsa yuvarla.
  return Math.round(n).toLocaleString("tr-TR");
}

function formatYuzde(n: number): string {
  return `%${n.toFixed(1).replace(".", ",")}`;
}

function formatTarih(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Yuvarlatılmış dikdörtgen — roundRect her yerde yok, elle çiziyoruz. */
function kutu(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export type CizimSecenekleri = {
  oran: Oran;
  kalite?: Kalite;
  /** "örnek veri" damgası basılsın mı? */
  ornek: boolean;
  baslik?: string;
  /** Tek bir ile odaklan: harita oraya yakınlaşır, üst yazıya il adı girer. */
  odakProvinceId?: string | null;
  /** Odaklanılan ilin adı (harita verisi renderer'da, ad çağıranda). */
  odakAdi?: string | null;
  /** Renk/ad kaynağı: siyasi (varsayılan) ya da futbol. */
  kaynak?: HaritaKaynagi;
  /** Video tarzı. */
  stil?: VideoStil;
  /** Kapak yazısı — boşsa tarzın varsayılanı kullanılır. */
  hookMetni?: string;
  /** Giriş ya da bitiş kartı çizilsin mi? */
  kart?: "giris" | "bitis" | null;
  /** Kart içi ilerleme 0–1 (soldurma/solma için). */
  kartIlerleme?: number;
  /** Bu anda rengi değişen iller — parlama ile vurgulanır. */
  degisenIller?: string[];
  /** En büyük devir — manşet ve çağrı etiketi için. */
  enBuyukDevir?: DevirBilgisi["enBuyuk"] | null;
  /** Ken Burns: harita büyütme oranı (1 = yok). */
  zoom?: number;
};

/**
 * Sosyal medya güvenli alanı — kare kenarından bırakılacak pay.
 *
 * Dikey videoyu TikTok ya da Reels'e yükleyince platformun kendi arayüzü
 * karenin üstüne biniyor: sağda beğeni/yorum/paylaş sütunu, altta açıklama
 * metni ve ses satırı, üstte sekmeler. Kenarlara pay bırakmazsak yazılar bu
 * arayüzün altında kalıyor. Oranlar iki platformun en kötü durumuna göre:
 * dikeyde üstte %12, altta %20 (yükseklikten), yanlarda %11 (genişlikten).
 * Yataydaki pay daha küçük, orada üste binen bir arayüz yok.
 */
const GUVENLI: Record<Oran, { ust: number; alt: number; yan: number }> = {
  "16:9": { ust: 0.075, alt: 0.085, yan: 0.045 },
  /*
   * 1.91:1 kare, 16:9'dan basık: yükseklikten alınan aynı oran daha az piksel
   * demek. Bu yüzden dikey paylar biraz artırıldı — yoksa yazılar kenara
   * fazla yaklaşıyor.
   */
  "1.91:1": { ust: 0.08, alt: 0.095, yan: 0.045 },
  "9:16": { ust: 0.12, alt: 0.2, yan: 0.11 },
  "1:1": { ust: 0.09, alt: 0.11, yan: 0.08 },
};

/** Güvenli alan payları — oran cinsinden (önizlemedeki kılavuz da bunu kullanıyor). */
export function guvenliPay(oran: Oran): { ust: number; alt: number; yan: number } {
  return GUVENLI[oran];
}

/** Güvenli alan kutusu — piksel cinsinden. */
export function guvenliAlan(oran: Oran, kalite: Kalite = "hd") {
  const { width, height } = BOYUTLAR[kalite][oran];
  const g = GUVENLI[oran];
  const x = Math.round(width * g.yan);
  const y = Math.round(height * g.ust);
  return { x, y, w: width - x * 2, h: height - y - Math.round(height * g.alt) };
}

/**
 * Arka plan katmanı: düz zemin + yumuşak radyal ışık.
 *
 * NEDEN ÖNBELLEKTE
 *
 * Bu iki dolgu her karede yeniden çiziliyordu ve radyal geçiş TÜM kareyi
 * kaplıyor. Ölçtüğümüzde kare maliyetinin yarısından fazlası buradaydı:
 * 1080p'de karenin tamamı 15,7 ms sürüyor, bunun 8,6 ms'i yalnızca arka plan.
 * Çizim kare hızına yetişemeyince yakalanan kare sayısı düşüyor ve video
 * "kare kare" akıyordu.
 *
 * Arka plan zamanla değişmediği için bir kez çizilip saklanıyor; karede
 * yapılan iş tek bir kopyalamaya (0,7 ms) iniyor. Renkler tarza göre
 * değiştiği için anahtarda stil de var.
 */
const arkaPlanlar = new Map<string, HTMLCanvasElement>();
function arkaPlanKatmani(
  width: number,
  height: number,
  dikey: boolean,
  stil: StilTanim,
): HTMLCanvasElement {
  const anahtar = `${width}x${height}x${dikey ? "d" : "y"}x${stil.id}`;
  const varolan = arkaPlanlar.get(anahtar);
  if (varolan) return varolan;

  const katman = document.createElement("canvas");
  katman.width = width;
  katman.height = height;
  const c = katman.getContext("2d")!;

  c.fillStyle = stil.bg;
  c.fillRect(0, 0, width, height);

  const glow = c.createRadialGradient(
    width * 0.3,
    height * (dikey ? 0.3 : 0.18),
    0,
    width * 0.3,
    height * (dikey ? 0.3 : 0.18),
    Math.max(width, height) * 0.9,
  );
  glow.addColorStop(0, stil.glow);
  glow.addColorStop(0.6, "rgba(0,0,0,0)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, width, height);

  // Ölçü/kalite/tarz kombinasyonu on iki civarı; sınır yalnızca kazara büyümeye karşı.
  if (arkaPlanlar.size > 16) arkaPlanlar.clear();
  arkaPlanlar.set(anahtar, katman);
  return katman;
}

type Alan = { x: number; y: number; w: number; h: number };

/**
 * Haritayı verilen alana sığdırıp ortalar.
 *
 * `odak` verilirse o ilin çevresine yakınlaşıyor ve komşular soluklaşıyor:
 * il bazlı videoda hangi ilden bahsedildiği tek bakışta anlaşılsın diye.
 * Ülke geneli görünümde hiçbir şey değişmiyor.
 *
 * `zoom` (Ken Burns) odak noktası çevresinde büyütür: kaydırma olmadan
 * kameranın yavaşça yaklaştığı hissini verir. `degisen` listesindeki iller
 * beyaz bir parlama çizgisiyle vurgulanır — rengin döndüğü an göze çarpsın.
 */
function haritaCiz(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  alan: Alan,
  odak?: string | null,
  kaynak: HaritaKaynagi = SIYASI_KAYNAK,
  ekstra: { zoom?: number; degisen?: string[]; parlama?: number; vurgu?: string } = {},
): void {
  const { zoom = 1, degisen = [], parlama = 1, vurgu = "#ffffff" } = ekstra;
  const kutu = odak ? ilKutusu(odak) : null;

  // Odaklıyken il, harita alanının kısa kenarının ~%50'sini kaplasın; küçük
  // iller aşırı büyümesin diye yakınlaşma tavanı var.
  const tabanOlcek = Math.min(alan.w / W, alan.h / H);
  const olcek =
    (kutu
      ? Math.min(
          tabanOlcek * 6,
          Math.min(alan.w * 0.5 / Math.max(kutu.w, 1), alan.h * 0.5 / Math.max(kutu.h, 1)),
        )
      : tabanOlcek) * zoom;

  const merkezX = kutu ? kutu.x + kutu.w / 2 : W / 2;
  const merkezY = kutu ? kutu.y + kutu.h / 2 : H / 2;
  const ox = alan.x + alan.w / 2 - merkezX * olcek;
  const oy = alan.y + alan.h / 2 - merkezY * olcek;

  ctx.save();
  // Yakınlaşınca taşan komşular alanın dışına sarkmasın.
  ctx.beginPath();
  ctx.rect(alan.x, alan.y, alan.w, alan.h);
  ctx.clip();

  ctx.translate(ox, oy);
  ctx.scale(olcek, olcek);
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.9 / olcek;
  ctx.strokeStyle = "rgba(3,7,18,0.75)";

  for (const { id, path } of provincePaths()) {
    const lider = frame.leaders[id];
    const secili = !odak || id === odak;
    ctx.fillStyle = lider ? kaynak.renk(lider) : NEUTRAL;
    ctx.globalAlpha = secili ? (lider ? 0.92 : 0.45) : 0.16;
    ctx.fill(path);
    ctx.globalAlpha = 1;
    ctx.stroke(path);
  }

  if (odak) {
    const hedef = provincePaths().find((p) => p.id === odak);
    if (hedef) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.2 / olcek;
      ctx.stroke(hedef.path);
    }
  }

  // Rengi değişen iller: beyaz çizgi + vurgu ışığı. Renk dönüşünün üstünde
  // kısa bir "parlama" izleyicinin gözünü tam o ile çekiyor.
  if (degisen.length > 0 && parlama > 0.02) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, parlama);
    ctx.lineJoin = "round";
    for (const id of degisen) {
      const p = provincePaths().find((pp) => pp.id === id);
      if (!p) continue;
      ctx.shadowColor = vurgu;
      ctx.shadowBlur = 26 / olcek;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.4 / olcek;
      ctx.stroke(p.path);
    }
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Tablonun kapladığı yükseklik: şerit + son satırın taban çizgisi.
 *
 * Yerleşimi önceden ölçebilmek için kapalı biçimde duruyor — çizim ile
 * hesabın ayrı formüller kullanması, blok yüksekliğinin yanlış çıkmasına ve
 * alttaki damganın kesilmesine yol açıyordu. Satır altındaki yüzde çubuğu bir
 * sonraki boşluğun içinde kalıyor, o yüzden buraya eklenmiyor.
 */
function tabloYuksekligi(satirH: number, seritH: number, adet: number): number {
  return seritH + satirH * (adet - 0.25);
}

/** Yüzde şeridi + parti satırları. Kapladığı yüksekliği döndürür. */
function tabloCiz(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  kaynak: HaritaKaynagi,
  o: {
    x: number;
    y: number;
    w: number;
    satirH: number;
    seritH: number;
    adet: number;
    /** Dikey yerleşimde her şey ortalı; boş durum yazısı da öyle olmalı. */
    ortala?: boolean;
  },
): number {
  const { x, y, w, satirH, seritH, adet, ortala = false } = o;

  // Tek ile daraltılmış videoda zamanın başında o ilde henüz oy olmuyor;
  // tablo alanı boş kalmasın.
  if (frame.national.length === 0) {
    ctx.textAlign = ortala ? "center" : "left";
    ctx.font = `600 ${Math.round(satirH * 0.42)}px "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillStyle = MUTED;
    ctx.fillText("Henüz oy yok", ortala ? x + w / 2 : x, y + satirH * 0.9);
    return tabloYuksekligi(satirH, seritH, adet);
  }

  let seritX = x;
  ctx.save();
  kutu(ctx, x, y, w, seritH, seritH / 2);
  ctx.clip();
  for (const row of frame.national) {
    const genislik = (row.pct / 100) * w;
    ctx.fillStyle = kaynak.renk(row.partyId);
    ctx.fillRect(seritX, y, genislik + 1, seritH);
    seritX += genislik;
  }
  ctx.restore();

  const enYuksek = frame.national[0]?.pct || 1;
  let sy = y + seritH + satirH * 0.75;

  for (const [i, row] of frame.national.slice(0, adet).entries()) {
    const renk = kaynak.renk(row.partyId);

    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(satirH * 0.4)}px "SF Mono", ui-monospace, monospace`;
    ctx.fillStyle = MUTED;
    ctx.fillText(String(i + 1), x, sy);

    const rozetX = x + satirH * 0.55;
    const rozetBoy = satirH * 0.62;
    ctx.fillStyle = renk;
    kutu(ctx, rozetX, sy - rozetBoy * 0.78, rozetBoy, rozetBoy, rozetBoy * 0.28);
    ctx.fill();

    const kisa = kaynak.kisaAd(row.partyId);
    ctx.fillStyle = kaynak.yaziTonu(row.partyId) === "dark" ? "#0b0f19" : "#ffffff";
    ctx.font = `800 ${Math.round(rozetBoy * (kisa.length > 3 ? 0.34 : 0.44))}px "SF Pro Display", Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(kisa, rozetX + rozetBoy / 2, sy - rozetBoy * 0.78 + rozetBoy * 0.68);

    ctx.textAlign = "left";
    ctx.fillStyle = TEXT;
    ctx.font = `${i === 0 ? 800 : 600} ${Math.round(satirH * 0.44)}px "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillText(kaynak.tamAd(row.partyId), rozetX + rozetBoy + satirH * 0.3, sy);

    ctx.textAlign = "right";
    ctx.font = `800 ${Math.round(satirH * 0.46)}px "SF Mono", ui-monospace, monospace`;
    ctx.fillStyle = i === 0 ? renk : TEXT;
    ctx.fillText(formatYuzde(row.pct), x + w, sy);

    // Yüzde çubuğu — en yüksek partiye göre ölçekli, fark gözle görünsün.
    const cubukY = sy + satirH * 0.18;
    const cubukH = Math.max(2, Math.round(satirH * 0.09));
    const cubukW = w - (rozetX - x);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(rozetX, cubukY, cubukW, cubukH);
    ctx.fillStyle = renk;
    ctx.fillRect(rozetX, cubukY, Math.max(2, (row.pct / enYuksek) * cubukW), cubukH);

    sy += satirH;
  }

  return tabloYuksekligi(satirH, seritH, adet);
}

/** Ortalanmış "365 oy" bloğu. */
function sayacCiz(
  ctx: CanvasRenderingContext2D,
  merkez: number,
  y: number,
  sayi: string,
  sayiBoy: number,
  birimBoy: number,
): void {
  const sayiFont = `800 ${sayiBoy}px "SF Mono", ui-monospace, monospace`;
  const birimFont = `600 ${birimBoy}px "SF Pro Text", Inter, system-ui, sans-serif`;
  const birim = " oy";

  ctx.textAlign = "left";
  ctx.font = sayiFont;
  const w1 = ctx.measureText(sayi).width;
  ctx.font = birimFont;
  const w2 = ctx.measureText(birim).width;

  const x = merkez - (w1 + w2) / 2;
  ctx.font = sayiFont;
  ctx.fillStyle = TEXT;
  ctx.fillText(sayi, x, y);
  ctx.font = birimFont;
  ctx.fillStyle = MUTED;
  ctx.fillText(birim, x + w1, y);
}

/* ------------------------- viral yardımcılar ----------------------------- */

/**
 * Devir bilgisi: hangi iller rengini değiştirdi, en büyük devir hangisi.
 *
 * `devirHaritasi(frames)` her veri karesi arasındaki değişimi önceden hesaplar;
 * video oynatılırken "şu an parlayacak iller" buradan seçilir. En büyük devir
 * yüzölçümüyle ölçülür — küçük bir il değil, gözle görünen bir il manşete
 * çıkar.
 */
export type DevirBilgisi = {
  degisen: string[];
  enBuyuk: { ilId: string; onceki: string | null; simdi: string } | null;
};

export function devirHaritasi(frames: Frame[]): DevirBilgisi[] {
  const out: DevirBilgisi[] = [];
  for (let i = 1; i < frames.length; i++) {
    const onceki = frames[i - 1].leaders;
    const simdi = frames[i].leaders;
    const degisen: string[] = [];
    let enBuyuk: DevirBilgisi["enBuyuk"] = null;
    let enBuyukAlan = 0;
    for (const p of PROVINCES) {
      const a = onceki[p.id];
      const b = simdi[p.id];
      if (a !== b) {
        degisen.push(p.id);
        const kutu = ilKutusu(p.id);
        const alan = kutu ? kutu.w * kutu.h : 0;
        if (b && alan > enBuyukAlan) {
          enBuyukAlan = alan;
          enBuyuk = { ilId: p.id, onceki: a, simdi: b };
        }
      }
    }
    out.push({ degisen, enBuyuk });
  }
  return out;
}

/** Metni kelime kelime satırlara böler; taşan satır "…" ile kırpılır. */
function metniBol(ctx: CanvasRenderingContext2D, metin: string, maxW: number, font: string): string[] {
  ctx.font = font;
  const kelimeler = metin.split(/\s+/).filter(Boolean);
  if (kelimeler.length === 0) return [];
  const satirlar: string[] = [];
  let satir = kelimeler[0];
  for (let i = 1; i < kelimeler.length; i++) {
    const deneme = `${satir} ${kelimeler[i]}`;
    if (ctx.measureText(deneme).width > maxW) {
      satirlar.push(satir);
      satir = kelimeler[i];
    } else {
      satir = deneme;
    }
  }
  satirlar.push(satir);
  if (satirlar.length > 2) {
    const birlesik = satirlar.slice(1).join(" ");
    let k = birlesik.length;
    while (k > 1 && ctx.measureText(`${birlesik.slice(0, k)}…`).width > maxW) k -= 1;
    return [satirlar[0], `${birlesik.slice(0, k)}…`];
  }
  return satirlar;
}

/**
 * Büyük manşet — en fazla iki satır, bloğa dikeyde ortalanmış.
 *
 * Yazı boyu önce bloğun yarısı kadar denenir; iki satıra sığmıyorsa küçültülür.
 * Viral reels açılışlarının olmazsa olmazı: koca harfler, tek bakışta okunur.
 */
function mansetCiz(
  ctx: CanvasRenderingContext2D,
  metin: string,
  merkez: number,
  y: number,
  maxW: number,
  blokH: number,
  renk: string,
): void {
  const font = (px: number) => `900 ${px}px "SF Pro Display", Inter, system-ui, sans-serif`;
  let px = blokH * 0.46;
  let satirlar: string[] = [];
  for (; px > blokH * 0.3; px -= 0.5) {
    satirlar = metniBol(ctx, metin, maxW, font(px));
    if (satirlar.length <= 2) break;
  }
  if (satirlar.length === 0) return;
  const satirYuk = px * 1.04;
  let sy = y + (blokH - satirYuk * satirlar.length) / 2 + px * 0.86;
  ctx.font = font(px);
  ctx.fillStyle = renk;
  ctx.textAlign = "center";
  for (const s of satirlar) {
    ctx.fillText(s, merkez, sy);
    sy += satirYuk;
  }
}

/** Üst şerit rozeti: "SON DAKİKA" ya da noktalı "CANLI" çipi. */
function rozetCiz(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  metin: string,
  vurgu: string,
  nokta: boolean,
): void {
  ctx.save();
  kutu(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = vurgu;
  ctx.fill();
  if (nokta) {
    ctx.beginPath();
    ctx.arc(x + h * 0.55, y + h / 2, h * 0.17, 0, Math.PI * 2);
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = h * 0.35;
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
    ctx.font = `800 ${h * 0.46}px "SF Pro Text", Inter, sans-serif`;
    ctx.fillText(metin, x + h * 0.9, y + h * 0.67);
  } else {
    ctx.textAlign = "center";
    ctx.font = `800 ${h * 0.46}px "SF Pro Text", Inter, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(metin, x + w / 2, y + h * 0.67);
  }
  ctx.restore();
}

/** Devir çağrı etiketi: "İSTANBUL → AK" pilli, parti rengi aksanlı. */
function devirEtiketiCiz(
  ctx: CanvasRenderingContext2D,
  sagaYaslaX: number,
  y: number,
  devir: DevirBilgisi["enBuyuk"] | null | undefined,
  boy: number,
  kaynak: HaritaKaynagi,
  vurgu: string,
): void {
  if (!devir) return;
  const ilAdi = (PROVINCE_BY_ID[devir.ilId]?.name ?? devir.ilId).toLocaleUpperCase("tr");
  const metin = `${ilAdi} → ${kaynak.kisaAd(devir.simdi)}`;
  const h = boy * 1.5;
  ctx.font = `800 ${boy}px "SF Pro Display", Inter, sans-serif`;
  const w = ctx.measureText(metin).width + h * 1.7;
  const cx = sagaYaslaX - w;
  const cy = y + h * 0.2;

  kutu(ctx, cx, cy, w, h, h / 2);
  ctx.fillStyle = "rgba(3,7,18,0.74)";
  ctx.fill();
  ctx.strokeStyle = vurgu;
  ctx.lineWidth = 1.5;
  kutu(ctx, cx, cy, w, h, h / 2);
  ctx.stroke();

  // Sol aksan: yeni liderin rengi
  ctx.fillStyle = kaynak.renk(devir.simdi);
  kutu(ctx, cx + 2, cy + 2, h - 4, h - 4, (h - 4) / 2);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${boy}px "SF Pro Display", Inter, sans-serif`;
  ctx.fillText(metin, cx + h * 0.5, cy + h * 0.66);
}

/** "Seçim Gecesi" sandık sayacı: yüzde + ince ilerleme çubuğu. */
function sandikCiz(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  acilanYuzde: number,
  vurgu: string,
): void {
  const yuzde = Math.max(0, Math.min(100, Math.round(acilanYuzde * 100)));
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.round(h * 0.42)}px "SF Pro Text", Inter, sans-serif`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`SANDIKLARIN %${yuzde}'İ AÇILDI`, x + w / 2, y + h * 0.45);

  const barY = y + h * 0.62;
  const barH = Math.max(2, Math.round(h * 0.16));
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  kutu(ctx, x, barY, w, barH, barH / 2);
  ctx.fill();
  ctx.fillStyle = vurgu;
  kutu(ctx, x, barY, Math.max(barH, w * acilanYuzde), barH, barH / 2);
  ctx.fill();
}

/** Haber bandı: kırmızı zemin, büyük manşet, altında eski → yeni parti. */
function altBantCiz(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  devir: DevirBilgisi["enBuyuk"] | null | undefined,
  varsayilan: string,
  kaynak: HaritaKaynagi,
  stil: StilTanim,
): void {
  const metin = devir
    ? `${(PROVINCE_BY_ID[devir.ilId]?.name ?? devir.ilId).toLocaleUpperCase("tr")} EL DEĞİŞTİRDİ`
    : varsayilan.toLocaleUpperCase("tr");

  ctx.save();
  kutu(ctx, x, y, w, h, h * 0.18);
  ctx.fillStyle = stil.vurgu;
  ctx.fill();

  ctx.textAlign = "left";
  ctx.font = `900 ${Math.round(h * 0.46)}px "SF Pro Display", Inter, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(metniBol(ctx, metin, w - h * 0.8, ctx.font)[0] ?? metin, x + h * 0.5, y + h * 0.62);

  if (devir && devir.onceki) {
    ctx.font = `700 ${Math.round(h * 0.28)}px "SF Pro Text", Inter, sans-serif`;
    ctx.fillText(
      `${kaynak.tamAd(devir.onceki)} → ${kaynak.tamAd(devir.simdi)}`,
      x + h * 0.5,
      y + h * 0.88,
    );
  }
  ctx.restore();
}

/** Üst satır: solda marka, sağda tarz rozeti (varsa). */
function ustSatirCiz(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  stil: StilTanim,
): void {
  ctx.textAlign = "left";
  ctx.font = `800 ${Math.round(h * 0.55)}px "SF Pro Display", Inter, sans-serif`;
  ctx.fillStyle = TEXT;
  ctx.fillText("partim.lol", x, y + h * 0.72);

  if (stil.rozet) {
    const nokta = stil.rozet === "CANLI";
    ctx.font = `800 ${Math.round(h * 0.42)}px "SF Pro Text", Inter, sans-serif`;
    const chipW = ctx.measureText(stil.rozet).width + h * (nokta ? 1.5 : 1.05);
    rozetCiz(ctx, x + w - chipW, y + h * 0.12, chipW, h * 0.76, stil.rozet, stil.vurgu, nokta);
  }
}

/**
 * Açılış kartı — videonun ilk saniyesi.
 *
 * İlk iki saniyede izleyiciyi durdurmak viral reels'in kuralı. Kart, ilk
 * karenin üstüne biner: koyu perde, vurgu renginde kocaman manşet ve
 * "81 il · 1 dakikada 1 oy" alt satırı. Son %30'da soldurarak haritayı açar.
 */
function girisKartiCiz(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stil: StilTanim,
  ilerleme: number,
  hook: string,
  odakAdi: string | null,
  ornek: boolean,
): void {
  const alfa = 1 - Math.max(0, (ilerleme - 0.7) / 0.3);
  if (alfa <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alfa;

  // Koyu perde — arkadaki ilk kare seçilsin.
  ctx.fillStyle = "rgba(3,6,12,0.88)";
  ctx.fillRect(0, 0, width, height);

  // Vurgu ışığı
  const glow = ctx.createRadialGradient(
    width / 2,
    height * 0.45,
    0,
    width / 2,
    height * 0.45,
    width * 0.75,
  );
  glow.addColorStop(0, `${stil.vurgu}30`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Marka
  ctx.textAlign = "left";
  ctx.font = `800 ${Math.round(width * 0.034)}px "SF Pro Display", Inter, sans-serif`;
  ctx.fillStyle = TEXT;
  ctx.fillText("partim.lol", Math.round(width * 0.05), Math.round(height * 0.09));

  if (ornek) {
    ctx.textAlign = "right";
    ctx.font = `800 ${Math.round(width * 0.02)}px "SF Pro Text", Inter, sans-serif`;
    ctx.fillStyle = "rgba(251,191,36,0.9)";
    ctx.fillText("ÖRNEK VERİ", Math.round(width * 0.95), Math.round(height * 0.09));
  }

  // Manşet — hafif ölçeklenerek girer.
  // Ölçek uygulanmışken elle geri translate etmek doğru olmaz (ölçek
  // translate'i de büyütür); save/restore ile dönülüyor.
  const gecis = Math.min(1, ilerleme / 0.7);
  const olcek = 0.94 + 0.06 * gecis;
  ctx.save();
  ctx.translate(width / 2, height * 0.46);
  ctx.scale(olcek, olcek);
  const blokH = Math.min(height * 0.3, width * 0.22);
  mansetCiz(ctx, hook, 0, -blokH / 2, width * 0.9, blokH, stil.vurgu);
  ctx.restore();

  // Alt satır
  const alt = odakAdi ? `${odakAdi} — 81 il içinden` : "81 il · 1 dakikada 1 oy";
  ctx.textAlign = "center";
  ctx.font = `600 ${Math.round(width * 0.026)}px "SF Pro Text", Inter, sans-serif`;
  ctx.fillStyle = MUTED;
  ctx.fillText(alt, width / 2, height * 0.46 + blokH / 2 + width * 0.055);

  // Oynat üçgeni
  const triY = height * 0.74;
  const triS = width * 0.024;
  ctx.beginPath();
  ctx.moveTo(width / 2 - triS, triY - triS);
  ctx.lineTo(width / 2 - triS, triY + triS);
  ctx.lineTo(width / 2 + triS * 1.5, triY);
  ctx.closePath();
  ctx.fillStyle = stil.vurgu;
  ctx.fill();

  ctx.restore();
}

/**
 * Kapanış kartı — videonun son saniyesi.
 *
 * Son karenin üstüne biner, yavaşça belirir: marka, slogan ve adres.
 * İzleyiciyi sitede bırakacak tek davet budur; videosu biten herkes
 * "partim.lol"ü görmeli.
 */
function bitisKartiCiz(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stil: StilTanim,
  ilerleme: number,
  odakAdi: string | null,
  ornek: boolean,
): void {
  const alfa = Math.min(1, ilerleme / 0.8);
  if (alfa <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alfa;

  // Perde — arkadaki son kare hafifçe seçilsin.
  ctx.fillStyle = "rgba(3,6,12,0.6)";
  ctx.fillRect(0, 0, width, height);

  const merkez = width / 2;
  const cy = height * 0.42;

  ctx.textAlign = "center";
  ctx.font = `900 ${Math.round(width * 0.085)}px "SF Pro Display", Inter, sans-serif`;
  ctx.fillStyle = TEXT;
  ctx.fillText("partim.lol", merkez, cy);

  ctx.font = `700 ${Math.round(width * 0.032)}px "SF Pro Text", Inter, sans-serif`;
  ctx.fillStyle = stil.vurgu;
  ctx.fillText(odakAdi ? `Sen de ${odakAdi} için oy ver` : "Sen de oy ver — ilini boya", merkez, cy + width * 0.062);

  ctx.font = `600 ${Math.round(width * 0.024)}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = MUTED;
  ctx.fillText("partim.lol", merkez, cy + width * 0.108);

  if (ornek) {
    ctx.textAlign = "right";
    ctx.font = `800 ${Math.round(width * 0.02)}px "SF Pro Text", Inter, sans-serif`;
    ctx.fillStyle = "rgba(251,191,36,0.9)";
    ctx.fillText("ÖRNEK VERİ", Math.round(width * 0.95), Math.round(height * 0.09));
  }

  ctx.restore();
}

/* ------------------------------ çizim ------------------------------------ */

type KareSecenekleri = Omit<CizimSecenekleri, "stil"> & {
  stil: StilTanim;
  kaynak: HaritaKaynagi;
  width: number;
  height: number;
  dikey: boolean;
  alan: Alan;
};

/** Yatay yerleşim: marka + sayaç üstte, harita solda, tablo sağda. */
function yatayCiz(ctx: CanvasRenderingContext2D, frame: Frame, o: KareSecenekleri): void {
  const { width, alan, stil, ornek, odakProvinceId, odakAdi, kaynak, hookMetni, degisenIller, enBuyukDevir, zoom } = o;
  const baslikBoy = Math.round(width * 0.032);
  const damgaBoy = Math.round(width * 0.012);
  const baslikY = alan.y + baslikBoy;

  // Marka
  ctx.textAlign = "left";
  ctx.font = `800 ${baslikBoy}px "SF Pro Display", Inter, system-ui, sans-serif`;
  ctx.fillStyle = TEXT;
  ctx.fillText("partim.lol", alan.x, baslikY);

  // Sağda sayaç
  ctx.textAlign = "right";
  ctx.font = `800 ${Math.round(width * 0.03)}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = TEXT;
  ctx.fillText(formatSayi(frame.totalVotes), alan.x + alan.w, baslikY);
  ctx.font = `600 ${Math.round(width * 0.014)}px "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.fillStyle = MUTED;
  ctx.fillText("oy", alan.x + alan.w, baslikY + Math.round(width * 0.024));

  // Rozet sayaç satırının altına sağa
  if (stil.rozet) {
    const boyut = Math.round(width * 0.021);
    ctx.font = `800 ${Math.round(boyut * 0.5)}px "SF Pro Text", Inter, sans-serif`;
    const chipW = ctx.measureText(stil.rozet).width + boyut * (stil.rozet === "CANLI" ? 1.5 : 1.05);
    rozetCiz(
      ctx,
      alan.x + alan.w - chipW,
      baslikY + Math.round(width * 0.014),
      chipW,
      boyut,
      stil.rozet,
      stil.vurgu,
      stil.rozet === "CANLI",
    );
  }

  // Tarih markanın altında
  ctx.textAlign = "left";
  ctx.font = `600 ${Math.round(width * 0.016)}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = MUTED;
  ctx.fillText(
    odakAdi ? `${odakAdi} · ${formatTarih(frame.at)}` : formatTarih(frame.at),
    alan.x,
    baslikY + Math.round(width * 0.026),
  );

  // Seçim gecesi: sağ üstte ince sandık çubuğu (rozetin altında kalır)
  if (stil.rozet === "CANLI") {
    const acikIl = PROVINCES.filter((p) => frame.leaders[p.id]).length;
    const oranX = acikIl / PROVINCES.length;
    const barW = Math.round(width * 0.12);
    const barH = Math.max(2, Math.round(width * 0.005));
    const barX = alan.x + alan.w - barW;
    const barY = baslikY + Math.round(width * 0.048);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    kutu(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();
    ctx.fillStyle = stil.vurgu;
    kutu(ctx, barX, barY, Math.max(barH, barW * oranX), barH, barH / 2);
    ctx.fill();
  }

  const altBantPay = stil.altBant ? Math.round(width * 0.06) : 0;
  const icerikY = baslikY + Math.round(width * 0.055);
  const icerikH = alan.y + alan.h - icerikY - Math.round(width * 0.03) - altBantPay;
  const sutunAra = Math.round(width * 0.03);
  const haritaW = Math.round(alan.w * 0.6) - sutunAra;

  haritaCiz(ctx, frame, { x: alan.x, y: icerikY, w: haritaW, h: icerikH }, odakProvinceId, kaynak, {
    zoom,
    degisen: degisenIller,
    parlama: 1,
    vurgu: stil.vurgu,
  });
  if (enBuyukDevir) {
    devirEtiketiCiz(ctx, alan.x + haritaW, icerikY, enBuyukDevir, Math.round(width * 0.017), kaynak, stil.vurgu);
  }

  const tabloX = alan.x + haritaW + sutunAra;
  const tabloW = alan.x + alan.w - tabloX;
  const seritH = Math.max(3, Math.round(width * 0.012));
  const adet = stil.tabloSatir;
  const satirH = Math.max(
    Math.round(width * 0.022),
    Math.min(Math.round(width * 0.042), Math.floor((icerikH - seritH) / adet)),
  );
  tabloCiz(ctx, frame, kaynak, { x: tabloX, y: icerikY, w: tabloW, satirH, seritH, adet });

  // Alt manşet bandı
  let damgaY = alan.y + alan.h - Math.round(damgaBoy * 0.3);
  if (stil.altBant) {
    const bantH = Math.round(width * 0.045);
    const bantY = alan.y + alan.h - bantH - Math.round(width * 0.018);
    altBantCiz(ctx, alan.x, bantY, alan.w, bantH, enBuyukDevir, hookMetni ?? stil.varsayilanHook, kaynak, stil);
    damgaY = bantY - Math.round(damgaBoy * 0.5);
  }

  ctx.textAlign = "left";
  ctx.font = `600 ${damgaBoy}px "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.fillStyle = "rgba(232,238,247,0.38)";
  // Taban çizgisi tam sınıra oturursa "ç/ğ/y" kuyrukları güvenli alanın
  // dışına taşıyor; bir pay bırakılıyor.
  ctx.fillText("Bir siyaset simülasyonu oyunu · gerçek seçim sonucu değildir", alan.x, damgaY);

  if (ornek) {
    ctx.textAlign = "right";
    ctx.font = `800 ${Math.round(width * 0.014)}px "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(251,191,36,0.85)";
    ctx.fillText("ÖRNEK VERİ", alan.x + alan.w, damgaY);
  }
}

/** Dikey yerleşim: rozet satırı, manşet, sayaç, harita, tablo, alt bant. */
function dikeyCiz(ctx: CanvasRenderingContext2D, frame: Frame, o: KareSecenekleri): void {
  const { width, alan, stil, ornek, odakProvinceId, odakAdi, kaynak, hookMetni, degisenIller, enBuyukDevir, zoom } = o;
  const merkez = width / 2;
  const adet = stil.tabloSatir;
  const hook = (hookMetni ?? stil.varsayilanHook).trim() || stil.varsayilanHook;

  /*
   * Ham ölçüler genişlikten türetiliyor; blok güvenli alana sığmıyorsa tümü
   * birlikte küçültülüyor — böylece kenar payı büyüdüğünde alttaki damga
   * kesilmiyor.
   */
  const ham = {
    ustSatir: width * 0.05,
    hook: width * 0.105,
    sayi: width * 0.085,
    birim: width * 0.032,
    tarih: width * 0.027,
    sandik: width * 0.05,
    serit: width * 0.016,
    satir: width * 0.052,
    araK: width * 0.02,
    araB: width * 0.035,
    harita: Math.min(alan.w * (H / W), alan.h * 0.36),
    altBant: width * 0.085,
    damga: width * 0.02,
  };

  const yukseklik = (m: typeof ham) =>
    m.ustSatir +
    m.araK +
    m.hook * 2.08 +
    m.araK +
    m.sayi +
    m.araK +
    m.tarih +
    (stil.rozet === "CANLI" ? m.araK + m.sandik : 0) +
    m.araB +
    m.harita +
    m.araB +
    tabloYuksekligi(m.satir, m.serit, adet) +
    m.araB +
    (stil.altBant ? m.altBant + m.araK : 0) +
    m.damga +
    // "ÖRNEK VERİ" damgası ikinci bir satır — hesaba katılmazsa güvenli
    // alanın altından taşar.
    (ornek ? m.araK + m.damga : 0);

  const k = Math.min(1, alan.h / yukseklik(ham));
  const m = {
    ustSatir: Math.round(ham.ustSatir * k),
    hook: Math.round(ham.hook * k),
    sayi: Math.round(ham.sayi * k),
    birim: Math.round(ham.birim * k),
    tarih: Math.round(ham.tarih * k),
    sandik: Math.round(ham.sandik * k),
    serit: Math.max(3, Math.round(ham.serit * k)),
    satir: Math.round(ham.satir * k),
    araK: Math.round(ham.araK * k),
    araB: Math.round(ham.araB * k),
    harita: Math.round(ham.harita * k),
    altBant: Math.round(ham.altBant * k),
    damga: Math.round(ham.damga * k),
  };

  let y = alan.y + Math.max(0, (alan.h - yukseklik(m)) / 2);

  // Üst satır: marka + rozet
  ustSatirCiz(ctx, alan.x, y, alan.w, m.ustSatir, stil);
  y += m.ustSatir + m.araK;

  // Manşet
  mansetCiz(ctx, hook, merkez, y, alan.w, m.hook * 2.08, stil.vurgu);
  y += m.hook * 2.08 + m.araK;

  // Sayaç
  y += m.sayi;
  sayacCiz(ctx, merkez, y, formatSayi(frame.totalVotes), m.sayi, m.birim);
  y += m.araK + m.tarih;

  ctx.textAlign = "center";
  ctx.font = `600 ${m.tarih}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = MUTED;
  ctx.fillText(
    odakAdi ? `${odakAdi} · ${formatTarih(frame.at)}` : formatTarih(frame.at),
    merkez,
    y,
  );

  // Seçim gecesi: sandık sayacı
  if (stil.rozet === "CANLI") {
    const acikIl = PROVINCES.filter((p) => frame.leaders[p.id]).length;
    y += m.araK;
    sandikCiz(ctx, alan.x, y, alan.w, m.sandik, acikIl / PROVINCES.length, stil.vurgu);
    y += m.sandik;
  }

  y += m.araB;
  haritaCiz(ctx, frame, { x: alan.x, y, w: alan.w, h: m.harita }, odakProvinceId, kaynak, {
    zoom,
    degisen: degisenIller,
    parlama: 1,
    vurgu: stil.vurgu,
  });
  if (enBuyukDevir) {
    devirEtiketiCiz(ctx, alan.x + alan.w, y, enBuyukDevir, Math.round(m.satir * 0.6), kaynak, stil.vurgu);
  }
  y += m.harita + m.araB;

  y += tabloCiz(ctx, frame, kaynak, {
    x: alan.x,
    y,
    w: alan.w,
    satirH: m.satir,
    seritH: m.serit,
    adet,
    ortala: true,
  });

  y += m.araB;
  if (stil.altBant) {
    altBantCiz(ctx, alan.x, y, alan.w, m.altBant, enBuyukDevir, hook, kaynak, stil);
    y += m.altBant + m.araK;
  }

  y += m.damga;
  ctx.textAlign = "center";
  ctx.font = `600 ${m.damga}px "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.fillStyle = "rgba(232,238,247,0.38)";
  ctx.fillText("Bir siyaset simülasyonu oyunu · gerçek seçim sonucu değildir", merkez, y);

  if (ornek) {
    y += m.araK + m.damga;
    ctx.font = `800 ${m.damga}px "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(251,191,36,0.85)";
    ctx.fillText("ÖRNEK VERİ", merkez, y);
  }
}

/** Normal kare: arka plan + tarza göre yerleşim. */
function kareCiz(ctx: CanvasRenderingContext2D, frame: Frame, opts: CizimSecenekleri): void {
  const { oran, kalite = "hd", kaynak = SIYASI_KAYNAK, stil: stilId = "klasik" } = opts;
  const stil = STILLER[stilId];
  const { width, height } = BOYUTLAR[kalite][oran];
  const dikey = oran === "9:16" || oran === "1:1";
  const alan = guvenliAlan(oran, kalite);

  ctx.drawImage(arkaPlanKatmani(width, height, dikey, stil), 0, 0);

  const baglam: KareSecenekleri = {
    ...opts,
    stil,
    kaynak,
    width,
    height,
    dikey,
    alan,
    hookMetni: opts.hookMetni ?? stil.varsayilanHook,
    degisenIller: opts.degisenIller ?? [],
    enBuyukDevir: opts.enBuyukDevir ?? null,
    zoom: opts.zoom ?? 1,
  };

  if (dikey) dikeyCiz(ctx, frame, baglam);
  else yatayCiz(ctx, frame, baglam);
}

/**
 * Tek bir kareyi çizer.
 *
 * Kart seçilmişse (giriş/bitiş) önce normal kare çizilir, sonra kart onun
 * üstüne biner — arkadaki harita kartın kenarlarından seçilir, geçiş yumuşak
 * olur.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  opts: CizimSecenekleri,
): void {
  const { kart = null, kartIlerleme = 0, hookMetni, stil: stilId = "klasik", oran, kalite = "hd", odakAdi = null, ornek } = opts;
  const stil = STILLER[stilId];
  const { width, height } = BOYUTLAR[kalite][oran];

  ctx.save();
  ctx.textBaseline = "alphabetic";

  kareCiz(ctx, frame, opts);

  if (kart === "giris") {
    girisKartiCiz(
      ctx,
      width,
      height,
      stil,
      kartIlerleme,
      (hookMetni ?? stil.varsayilanHook).trim() || stil.varsayilanHook,
      odakAdi,
      ornek,
    );
  } else if (kart === "bitis") {
    bitisKartiCiz(ctx, width, height, stil, kartIlerleme, odakAdi, ornek);
  }

  ctx.restore();
}
