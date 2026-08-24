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
 */
import { PARTY_BY_ID, partyColor, partyShortName } from "@/data/parties";
import { PROVINCES } from "@/data/provinces";
import type { Frame } from "@/lib/timelapse";

/** provinces.ts ile aynı viewBox */
const W = 1000;
const H = 422.49;

const BG = "#060a12";
const NEUTRAL = "#1b2436";
const TEXT = "#e8eef7";
const MUTED = "rgba(232,238,247,0.55)";

export type Oran = "16:9" | "9:16" | "1:1";

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
  },
  fullhd: {
    "16:9": { width: 1920, height: 1080 },
    "9:16": { width: 1080, height: 1920 },
    "1:1": { width: 1080, height: 1080 },
  },
};

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

type Alan = { x: number; y: number; w: number; h: number };

/** Haritayı verilen alana sığdırıp ortalar. */
function haritaCiz(ctx: CanvasRenderingContext2D, frame: Frame, alan: Alan): void {
  const olcek = Math.min(alan.w / W, alan.h / H);
  const ox = alan.x + (alan.w - W * olcek) / 2;
  const oy = alan.y + (alan.h - H * olcek) / 2;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(olcek, olcek);
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.9 / olcek;
  ctx.strokeStyle = "rgba(3,7,18,0.75)";
  for (const { id, path } of provincePaths()) {
    const lider = frame.leaders[id];
    ctx.fillStyle = lider ? partyColor(lider) : NEUTRAL;
    ctx.globalAlpha = lider ? 0.92 : 0.45;
    ctx.fill(path);
    ctx.globalAlpha = 1;
    ctx.stroke(path);
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
  o: { x: number; y: number; w: number; satirH: number; seritH: number; adet: number },
): number {
  const { x, y, w, satirH, seritH, adet } = o;

  let seritX = x;
  ctx.save();
  kutu(ctx, x, y, w, seritH, seritH / 2);
  ctx.clip();
  for (const row of frame.national) {
    const genislik = (row.pct / 100) * w;
    ctx.fillStyle = partyColor(row.partyId);
    ctx.fillRect(seritX, y, genislik + 1, seritH);
    seritX += genislik;
  }
  ctx.restore();

  const enYuksek = frame.national[0]?.pct || 1;
  let sy = y + seritH + satirH * 0.75;

  for (const [i, row] of frame.national.slice(0, adet).entries()) {
    const renk = partyColor(row.partyId);

    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(satirH * 0.4)}px "SF Mono", ui-monospace, monospace`;
    ctx.fillStyle = MUTED;
    ctx.fillText(String(i + 1), x, sy);

    const rozetX = x + satirH * 0.55;
    const rozetBoy = satirH * 0.62;
    ctx.fillStyle = renk;
    kutu(ctx, rozetX, sy - rozetBoy * 0.78, rozetBoy, rozetBoy, rozetBoy * 0.28);
    ctx.fill();

    const kisa = partyShortName(row.partyId);
    ctx.fillStyle = PARTY_BY_ID[row.partyId]?.on === "dark" ? "#0b0f19" : "#ffffff";
    ctx.font = `800 ${Math.round(rozetBoy * (kisa.length > 3 ? 0.34 : 0.44))}px "SF Pro Display", Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(kisa, rozetX + rozetBoy / 2, sy - rozetBoy * 0.78 + rozetBoy * 0.68);

    ctx.textAlign = "left";
    ctx.fillStyle = TEXT;
    ctx.font = `${i === 0 ? 800 : 600} ${Math.round(satirH * 0.44)}px "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillText(PARTY_BY_ID[row.partyId]?.name ?? row.partyId, rozetX + rozetBoy + satirH * 0.3, sy);

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

/**
 * Tek bir kareyi çizer.
 *
 * Yerleşim orana göre değişiyor: yatayda harita solda ve tablo sağda,
 * dikeyde her şey tek sütunda ve ortalanmış. Sosyal medyada dikey videonun
 * yatayı kırpılmış hâli hep kötü duruyor, ayrı yerleşim şart.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  { oran, kalite = "hd", ornek, baslik = "partim.lol" }: CizimSecenekleri,
): void {
  const { width, height } = BOYUTLAR[kalite][oran];
  const dikey = oran !== "16:9";
  const alan = guvenliAlan(oran, kalite);

  ctx.save();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  // Arka planda yumuşak bir ışık: düz siyah zemin videoda ölü duruyor.
  const glow = ctx.createRadialGradient(
    width * 0.3,
    height * (dikey ? 0.3 : 0.18),
    0,
    width * 0.3,
    height * (dikey ? 0.3 : 0.18),
    Math.max(width, height) * 0.9,
  );
  glow.addColorStop(0, "rgba(34,211,238,0.16)");
  glow.addColorStop(0.55, "rgba(59,130,246,0.06)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = "alphabetic";

  if (dikey) {
    /* ----------------------------- dikey yerleşim --------------------------
     * Her şey tek sütunda ve ortalanmış. Ölçüler önce genişlikten türetiliyor,
     * sonra blok güvenli alana sığmıyorsa tümü birlikte küçültülüyor — böylece
     * kenar payı büyüdüğünde alttaki damga kesilmiyor.
     */
    const merkez = width / 2;
    const adet = oran === "1:1" ? 5 : 7;
    const damgaSayisi = ornek ? 2 : 1;

    const ham = {
      baslik: width * 0.058,
      sayi: width * 0.1,
      birim: width * 0.034,
      tarih: width * 0.027,
      damga: width * 0.021,
      serit: width * 0.017,
      satir: width * 0.058,
      araK: width * 0.03,
      araB: width * 0.05,
      harita: Math.min(alan.w * (H / W), alan.h * 0.3),
    };
    const yukseklik = (m: typeof ham) =>
      m.baslik +
      m.araK +
      m.sayi +
      m.araK +
      m.tarih +
      m.araB +
      m.harita +
      m.araB +
      tabloYuksekligi(m.satir, m.serit, adet) +
      m.araB +
      m.damga * damgaSayisi +
      (damgaSayisi > 1 ? m.araK : 0);

    const k = Math.min(1, alan.h / yukseklik(ham));
    const m = {
      baslik: Math.round(ham.baslik * k),
      sayi: Math.round(ham.sayi * k),
      birim: Math.round(ham.birim * k),
      tarih: Math.round(ham.tarih * k),
      damga: Math.round(ham.damga * k),
      serit: Math.max(3, Math.round(ham.serit * k)),
      satir: Math.round(ham.satir * k),
      araK: Math.round(ham.araK * k),
      araB: Math.round(ham.araB * k),
      harita: Math.round(ham.harita * k),
    };

    let y = alan.y + Math.max(0, (alan.h - yukseklik(m)) / 2);

    ctx.textAlign = "center";
    y += m.baslik;
    ctx.font = `800 ${m.baslik}px "SF Pro Display", Inter, system-ui, sans-serif`;
    ctx.fillStyle = TEXT;
    ctx.fillText(baslik, merkez, y);

    y += m.araK + m.sayi;
    sayacCiz(ctx, merkez, y, formatSayi(frame.totalVotes), m.sayi, m.birim);

    y += m.araK + m.tarih;
    ctx.textAlign = "center";
    ctx.font = `600 ${m.tarih}px "SF Mono", ui-monospace, monospace`;
    ctx.fillStyle = MUTED;
    ctx.fillText(formatTarih(frame.at), merkez, y);

    y += m.araB;
    haritaCiz(ctx, frame, { x: alan.x, y, w: alan.w, h: m.harita });
    y += m.harita + m.araB;

    y += tabloCiz(ctx, frame, {
      x: alan.x,
      y,
      w: alan.w,
      satirH: m.satir,
      seritH: m.serit,
      adet,
    });

    y += m.araB + m.damga;
    ctx.textAlign = "center";
    ctx.font = `600 ${m.damga}px "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(232,238,247,0.38)";
    ctx.fillText("Bir siyaset simülasyonu oyunu · gerçek seçim sonucu değildir", merkez, y);

    if (ornek) {
      // Örnek veriyle üretilen video gerçek sonuç sanılmamalı.
      y += m.araK + m.damga;
      ctx.font = `800 ${m.damga}px "SF Pro Text", Inter, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(251,191,36,0.85)";
      ctx.fillText("ÖRNEK VERİ", merkez, y);
    }
  } else {
    /* ----------------------------- yatay yerleşim -------------------------- */
    const baslikBoy = Math.round(width * 0.032);
    const damgaBoy = Math.round(width * 0.012);
    const baslikY = alan.y + baslikBoy;

    ctx.textAlign = "left";
    ctx.font = `800 ${baslikBoy}px "SF Pro Display", Inter, system-ui, sans-serif`;
    ctx.fillStyle = TEXT;
    ctx.fillText(baslik, alan.x, baslikY);

    ctx.font = `600 ${Math.round(width * 0.016)}px "SF Mono", ui-monospace, monospace`;
    ctx.fillStyle = MUTED;
    ctx.fillText(formatTarih(frame.at), alan.x, baslikY + Math.round(width * 0.026));

    ctx.textAlign = "right";
    ctx.font = `800 ${Math.round(width * 0.03)}px "SF Mono", ui-monospace, monospace`;
    ctx.fillStyle = TEXT;
    ctx.fillText(formatSayi(frame.totalVotes), alan.x + alan.w, baslikY);
    ctx.font = `600 ${Math.round(width * 0.014)}px "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillStyle = MUTED;
    ctx.fillText("oy", alan.x + alan.w, baslikY + Math.round(width * 0.024));

    const icerikY = baslikY + Math.round(width * 0.045);
    const icerikH = alan.y + alan.h - icerikY - Math.round(width * 0.03);
    const sutunAra = Math.round(width * 0.03);
    const haritaW = Math.round(alan.w * 0.6) - sutunAra;

    haritaCiz(ctx, frame, { x: alan.x, y: icerikY, w: haritaW, h: icerikH });

    const tabloX = alan.x + haritaW + sutunAra;
    const tabloW = alan.x + alan.w - tabloX;
    const seritH = Math.max(3, Math.round(width * 0.012));
    const adet = 10;
    const satirH = Math.max(
      Math.round(width * 0.022),
      Math.min(Math.round(width * 0.042), Math.floor((icerikH - seritH) / adet)),
    );
    tabloCiz(ctx, frame, { x: tabloX, y: icerikY, w: tabloW, satirH, seritH, adet });

    ctx.textAlign = "left";
    ctx.font = `600 ${damgaBoy}px "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(232,238,247,0.38)";
    // Taban çizgisi tam sınıra oturursa "ç/ğ/y" kuyrukları güvenli alanın
    // dışına taşıyor; bir pay bırakılıyor.
    const damgaY = alan.y + alan.h - Math.round(damgaBoy * 0.3);
    ctx.fillText("Bir siyaset simülasyonu oyunu · gerçek seçim sonucu değildir", alan.x, damgaY);

    if (ornek) {
      // Örnek veriyle üretilen video gerçek sonuç sanılmamalı.
      ctx.textAlign = "right";
      ctx.font = `800 ${Math.round(width * 0.014)}px "SF Pro Text", Inter, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(251,191,36,0.85)";
      ctx.fillText("ÖRNEK VERİ", alan.x + alan.w, damgaY);
    }
  }

  ctx.restore();
}
