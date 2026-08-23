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

export const BOYUTLAR: Record<Oran, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

/** `d` metinleri her karede yeniden ayrıştırılmasın diye bir kez kuruluyor. */
let yollar: Array<{ id: string; path: Path2D }> | null = null;
function provincePaths() {
  yollar ??= PROVINCES.map((province) => ({ id: province.id, path: new Path2D(province.d) }));
  return yollar;
}

function formatSayi(n: number): string {
  return n.toLocaleString("tr-TR");
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
  /** "örnek veri" damgası basılsın mı? */
  ornek: boolean;
  baslik?: string;
};

/**
 * Tek bir kareyi çizer.
 *
 * Yerleşim orana göre değişiyor: yatayda harita solda ve tablo sağda,
 * dikeyde harita üstte ve tablo altta. Sosyal medyada dikey videonun
 * yatayı kırpılmış hâli hep kötü duruyor, ayrı yerleşim şart.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  { oran, ornek, baslik = "partim.lol" }: CizimSecenekleri,
): void {
  const { width, height } = BOYUTLAR[oran];
  const dikey = oran !== "16:9";

  ctx.save();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  // Arka planda yumuşak bir ışık: düz siyah zemin videoda ölü duruyor.
  const glow = ctx.createRadialGradient(
    width * 0.3,
    height * 0.18,
    0,
    width * 0.3,
    height * 0.18,
    Math.max(width, height) * 0.9,
  );
  glow.addColorStop(0, "rgba(34,211,238,0.16)");
  glow.addColorStop(0.55, "rgba(59,130,246,0.06)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const pad = Math.round(width * (dikey ? 0.055 : 0.035));

  /* --------------------------------- başlık ------------------------------- */
  const baslikY = pad + Math.round(width * 0.02);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `800 ${Math.round(width * (dikey ? 0.058 : 0.032))}px "SF Pro Display", Inter, system-ui, sans-serif`;
  ctx.fillStyle = TEXT;
  ctx.fillText(baslik, pad, baslikY);

  ctx.font = `600 ${Math.round(width * (dikey ? 0.028 : 0.016))}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = MUTED;
  ctx.fillText(formatTarih(frame.at), pad, baslikY + Math.round(width * (dikey ? 0.042 : 0.026)));

  ctx.textAlign = "right";
  ctx.font = `800 ${Math.round(width * (dikey ? 0.05 : 0.03))}px "SF Mono", ui-monospace, monospace`;
  ctx.fillStyle = TEXT;
  ctx.fillText(formatSayi(frame.totalVotes), width - pad, baslikY);
  ctx.font = `600 ${Math.round(width * (dikey ? 0.024 : 0.014))}px "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.fillStyle = MUTED;
  ctx.fillText("oy", width - pad, baslikY + Math.round(width * (dikey ? 0.038 : 0.024)));

  /* -------------------------------- harita -------------------------------- */
  const haritaAlani = dikey
    ? { x: pad, y: baslikY + width * 0.07, w: width - pad * 2, h: height * (oran === "1:1" ? 0.36 : 0.32) }
    : { x: pad, y: baslikY + width * 0.045, w: width * 0.62, h: height - baslikY - width * 0.09 };

  const olcek = Math.min(haritaAlani.w / W, haritaAlani.h / H);
  const ox = haritaAlani.x + (haritaAlani.w - W * olcek) / 2;
  const oy = haritaAlani.y + (haritaAlani.h - H * olcek) / 2;

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

  /* ------------------------------ parti tablosu ---------------------------- */
  const tablo = dikey
    ? { x: pad, y: haritaAlani.y + haritaAlani.h + width * 0.03, w: width - pad * 2 }
    : { x: width * 0.66, y: baslikY + width * 0.045, w: width * 0.34 - pad };

  const satirYuksekligi = Math.round(width * (dikey ? 0.062 : 0.042));
  const gosterilen = frame.national.slice(0, dikey ? 8 : 10);

  // Yüzde şeridi
  const seritY = tablo.y;
  const seritH = Math.round(width * (dikey ? 0.018 : 0.012));
  let seritX = tablo.x;
  ctx.save();
  kutu(ctx, tablo.x, seritY, tablo.w, seritH, seritH / 2);
  ctx.clip();
  for (const row of frame.national) {
    const genislik = (row.pct / 100) * tablo.w;
    ctx.fillStyle = partyColor(row.partyId);
    ctx.fillRect(seritX, seritY, genislik + 1, seritH);
    seritX += genislik;
  }
  ctx.restore();

  let y = seritY + seritH + satirYuksekligi * 0.75;
  for (const [i, row] of gosterilen.entries()) {
    const renk = partyColor(row.partyId);

    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(satirYuksekligi * 0.4)}px "SF Mono", ui-monospace, monospace`;
    ctx.fillStyle = MUTED;
    ctx.fillText(String(i + 1), tablo.x, y);

    const rozetX = tablo.x + satirYuksekligi * 0.55;
    const rozetBoy = satirYuksekligi * 0.62;
    ctx.fillStyle = renk;
    kutu(ctx, rozetX, y - rozetBoy * 0.78, rozetBoy, rozetBoy, rozetBoy * 0.28);
    ctx.fill();

    const kisa = partyShortName(row.partyId);
    ctx.fillStyle = PARTY_BY_ID[row.partyId]?.on === "dark" ? "#0b0f19" : "#ffffff";
    ctx.font = `800 ${Math.round(rozetBoy * (kisa.length > 3 ? 0.34 : 0.44))}px "SF Pro Display", Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(kisa, rozetX + rozetBoy / 2, y - rozetBoy * 0.78 + rozetBoy * 0.68);

    ctx.textAlign = "left";
    ctx.fillStyle = TEXT;
    ctx.font = `${i === 0 ? 800 : 600} ${Math.round(satirYuksekligi * 0.44)}px "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillText(
      PARTY_BY_ID[row.partyId]?.name ?? row.partyId,
      rozetX + rozetBoy + satirYuksekligi * 0.3,
      y,
    );

    ctx.textAlign = "right";
    ctx.font = `800 ${Math.round(satirYuksekligi * 0.46)}px "SF Mono", ui-monospace, monospace`;
    ctx.fillStyle = i === 0 ? renk : TEXT;
    ctx.fillText(formatYuzde(row.pct), tablo.x + tablo.w, y);

    // Yüzde çubuğu — en yüksek partiye göre ölçekli, fark gözle görünsün.
    const enYuksek = frame.national[0]?.pct || 1;
    const cubukY = y + satirYuksekligi * 0.18;
    const cubukH = Math.max(2, Math.round(satirYuksekligi * 0.09));
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(rozetX, cubukY, tablo.w - (rozetX - tablo.x), cubukH);
    ctx.fillStyle = renk;
    ctx.fillRect(
      rozetX,
      cubukY,
      Math.max(2, ((row.pct / enYuksek) * (tablo.w - (rozetX - tablo.x)))),
      cubukH,
    );

    y += satirYuksekligi;
  }

  /* -------------------------------- damgalar ------------------------------- */
  ctx.textAlign = "left";
  ctx.font = `600 ${Math.round(width * (dikey ? 0.019 : 0.012))}px "SF Pro Text", Inter, system-ui, sans-serif`;
  ctx.fillStyle = "rgba(232,238,247,0.38)";
  ctx.fillText(
    "Bir siyaset simülasyonu oyunu · gerçek seçim sonucu değildir",
    pad,
    height - pad * 0.6,
  );

  if (ornek) {
    // Örnek veriyle üretilen video gerçek sonuç sanılmamalı.
    ctx.textAlign = "right";
    ctx.font = `800 ${Math.round(width * (dikey ? 0.022 : 0.014))}px "SF Pro Text", Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(251,191,36,0.85)";
    ctx.fillText("ÖRNEK VERİ", width - pad, height - pad * 0.6);
  }

  ctx.restore();
}
