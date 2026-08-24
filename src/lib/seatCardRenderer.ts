/**
 * İl başkanlığı kartı.
 *
 * Koltuğu alan kişinin paylaşabileceği görsel. Oyunun büyüme döngüsü bunun
 * üstünde: kişi parasının karşılığını göstermek için kartı kendi paylaşıyor,
 * takipçileri oyunu görüyor. Bu yüzden kart "ekran görüntüsü" değil, sosyal
 * medyanın istediği ölçüde (1200×675) ayrı çiziliyor.
 *
 * TASARIM KARARLARI
 *
 * - Arka planda ülke silueti var ve kazanılan il parti renginde yanıyor.
 *   Oyunu tanımayan biri karta baktığında "Türkiye haritası üzerinde bir yer
 *   kapılmış" mesajını yazıyı okumadan alıyor. Siluet, uygulamanın haritasıyla
 *   aynı kaynaktan (data/provinces.ts) çiziliyor.
 * - Bedel kartın kahramanı: kendi ölçeğinde, kendi renginde ve monospace.
 *   Altındaki etiket ise ince, aralıklı ve soluk — aynı bloğun içinde iki ayrı
 *   ses olsun ki rakam okunurken etikete takılmayasın.
 */
import { PARTY_BY_ID, partyColor, partyShortName } from "@/data/parties";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";

export const KART_EN = 1200;
export const KART_BOY = 675;

/** provinces.ts ile aynı viewBox */
const HARITA_EN = 1000;
const HARITA_BOY = 422.49;

export type SeatCardData = {
  provinceId: string;
  partyId: string;
  handle: string;
  /** Ödenen tutar (USD) */
  price: number;
  /** ISO tarih; verilmezse bugün */
  at?: string;
  /** Kaçıncı el değiştirme (0 = ilk başkan) */
  takeovers?: number;
  /**
   * Gerçekleşmiş bir satın alma değilse işaretlenir; kartın köşesine beyaz bir
   * nokta konur. Yazı yok — işaretin ne demek olduğu bilinen bir şey.
   */
  ornek?: boolean;
};

/** `d` metinleri her çizimde yeniden ayrıştırılmasın diye bir kez kuruluyor. */
let yollar: Array<{ id: string; path: Path2D }> | null = null;
function provincePaths() {
  yollar ??= PROVINCES.map((province) => ({ id: province.id, path: new Path2D(province.d) }));
  return yollar;
}

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

/** #RRGGBB → rgba(...) */
function alfa(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(34,211,238,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const DISPLAY = '"SF Pro Display", Inter, system-ui, sans-serif';
const TEXT = '"SF Pro Text", Inter, system-ui, sans-serif';
const MONO = '"SF Mono", ui-monospace, "Roboto Mono", monospace';

export function drawSeatCard(ctx: CanvasRenderingContext2D, data: SeatCardData): void {
  const province = PROVINCE_BY_ID[data.provinceId];
  const party = PARTY_BY_ID[data.partyId];
  const renk = partyColor(data.partyId);
  const W = KART_EN;
  const H = KART_BOY;
  const pad = 62;

  ctx.save();
  ctx.fillStyle = "#05080f";
  ctx.fillRect(0, 0, W, H);

  /* ------------------------- arka plan: ülke silueti ----------------------- */
  // Sağ tarafta, taşacak kadar büyük: kart bir haritanın üstünde duruyor gibi.
  /*
   * Siluet KAZANILAN İLE GÖRE konumlanıyor: hangi il olursa olsun kartın aynı
   * noktasında (sağ üst çeyrek) parlıyor, ülke de etrafına yayılıyor. Haritayı
   * sabit yerleştirseydik Hakkâri köşede kaybolur, İstanbul kenardan taşardı.
   */
  ctx.save();
  const olcek = (W * 1.02) / HARITA_EN;
  const odak = { x: W * 0.775, y: H * 0.38 };
  ctx.translate(odak.x - (province?.cx ?? HARITA_EN / 2) * olcek,
                odak.y - (province?.cy ?? HARITA_BOY / 2) * olcek);
  ctx.scale(olcek, olcek);
  for (const { id, path } of provincePaths()) {
    if (id === data.provinceId) continue;
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fill(path);
    ctx.lineWidth = 0.8 / olcek;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.stroke(path);
  }
  // Kazanılan il: parti renginde ve ışıklı.
  const kazanilan = provincePaths().find((p) => p.id === data.provinceId);
  if (kazanilan) {
    ctx.save();
    ctx.shadowColor = alfa(renk, 0.9);
    ctx.shadowBlur = 34 / olcek;
    ctx.fillStyle = alfa(renk, 0.95);
    ctx.fill(kazanilan.path);
    ctx.restore();
    ctx.lineWidth = 1.6 / olcek;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke(kazanilan.path);
  }
  ctx.restore();

  // Metnin okunduğu sol taraf koyulaşsın; siluet sağda nefes alsın.
  const perde = ctx.createLinearGradient(0, 0, W, 0);
  perde.addColorStop(0, "rgba(5,8,15,0.97)");
  perde.addColorStop(0.5, "rgba(5,8,15,0.82)");
  perde.addColorStop(1, "rgba(5,8,15,0.35)");
  ctx.fillStyle = perde;
  ctx.fillRect(0, 0, W, H);

  // Parti renginde köşe ışığı
  const g = ctx.createRadialGradient(W * 0.86, H * 0.08, 0, W * 0.86, H * 0.08, W * 0.7);
  g.addColorStop(0, alfa(renk, 0.3));
  g.addColorStop(0.55, alfa(renk, 0.07));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Kenar
  ctx.strokeStyle = alfa(renk, 0.32);
  ctx.lineWidth = 2.5;
  kutu(ctx, 1.25, 1.25, W - 2.5, H - 2.5, 26);
  ctx.stroke();

  ctx.textBaseline = "alphabetic";

  /* ------------------------------ üst şerit -------------------------------- */
  ctx.textAlign = "left";
  ctx.font = `800 27px ${DISPLAY}`;
  ctx.fillStyle = "rgba(232,238,247,0.9)";
  ctx.fillText("partim.lol", pad, pad + 10);

  const etiket = "İL BAŞKANI";
  ctx.font = `800 17px ${TEXT}`;
  const etW = ctx.measureText(etiket).width + 30;
  ctx.fillStyle = alfa(renk, 0.2);
  kutu(ctx, W - pad - etW, pad - 14, etW, 36, 18);
  ctx.fill();
  ctx.strokeStyle = alfa(renk, 0.6);
  ctx.lineWidth = 1.5;
  kutu(ctx, W - pad - etW, pad - 14, etW, 36, 18);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = renk;
  ctx.fillText(etiket, W - pad - etW / 2, pad + 10);

  /* --------------------------- parti + il adı ------------------------------ */
  const rozet = 96;
  const ry = 158;
  ctx.fillStyle = renk;
  kutu(ctx, pad, ry, rozet, rozet, 25);
  ctx.fill();
  const parlak = ctx.createLinearGradient(pad, ry, pad, ry + rozet);
  parlak.addColorStop(0, "rgba(255,255,255,0.3)");
  parlak.addColorStop(0.6, "rgba(255,255,255,0)");
  ctx.fillStyle = parlak;
  kutu(ctx, pad, ry, rozet, rozet, 25);
  ctx.fill();

  const kisa = partyShortName(data.partyId);
  ctx.fillStyle = party?.on === "dark" ? "#0b0f19" : "#ffffff";
  ctx.font = `800 ${kisa.length > 3 ? 31 : 41}px ${DISPLAY}`;
  ctx.textAlign = "center";
  ctx.fillText(kisa, pad + rozet / 2, ry + rozet / 2 + (kisa.length > 3 ? 11 : 15));

  const mx = pad + rozet + 28;
  ctx.textAlign = "left";
  ctx.font = `700 22px ${TEXT}`;
  ctx.fillStyle = alfa(renk, 0.95);
  ctx.fillText((party?.name ?? data.partyId).toLocaleUpperCase("tr"), mx, ry + 30);

  ctx.font = `800 96px ${DISPLAY}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(province?.name ?? data.provinceId, mx, ry + 108);

  /* --------------------------- orta: oyunun kuralı -------------------------- */
  /*
   * Kartın ortası boş kalıyordu. Buraya kartı gören yabancının merak ettiği
   * iki bilgiyi koyuyoruz: bu koltuk kaça devralınır ve ne kadardır elde.
   * Hem boşluğu dolduruyor hem oyunun kuralını yazıyla anlatmadan gösteriyor.
   */
  const cipler: string[] = [
    `Devralmak için en az $${(data.price + 1).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`,
  ];
  if (data.at) {
    const saat = Math.floor((Date.now() - new Date(data.at).getTime()) / 3_600_000);
    if (saat >= 1) {
      cipler.push(saat >= 48 ? `${Math.floor(saat / 24)} gündür koltukta` : `${saat} saattir koltukta`);
    }
  }

  let cx = pad;
  const cy = 336;
  ctx.textAlign = "left";
  for (const metin of cipler) {
    ctx.font = `700 17px ${TEXT}`;
    const w = ctx.measureText(metin).width + 34;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    kutu(ctx, cx, cy - 25, w, 38, 19);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.11)";
    ctx.lineWidth = 1;
    kutu(ctx, cx, cy - 25, w, 38, 19);
    ctx.stroke();
    ctx.fillStyle = "rgba(232,238,247,0.78)";
    ctx.fillText(metin, cx + 17, cy);
    cx += w + 12;
  }

  /* ------------------------------- alt blok -------------------------------- */
  const altY = H - pad - 104;

  // Ayırıcı çizgi — iki bilgi bloğu arasında sessiz bir sınır.
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, altY - 44);
  ctx.lineTo(W - pad, altY - 44);
  ctx.stroke();

  // Sol: kim
  ctx.textAlign = "left";
  ctx.font = `600 15px ${TEXT}`;
  ctx.fillStyle = "rgba(232,238,247,0.45)";
  ctx.fillText(
    data.takeovers && data.takeovers > 0 ? "DEVRALDI" : "İLK BAŞKAN",
    pad,
    altY - 4,
  );
  ctx.font = `800 46px ${DISPLAY}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`@${data.handle}`, pad, altY + 44);

  /*
   * Sağ: bedel.
   *
   * Etiket rakamın ÜSTÜNDE ve ayrı bir ses: 15 piksel, aralıklı, soluk, düz
   * metin fontu. Rakam ise iri, monospace ve parti renginde. Altta yan yana
   * durduklarında ikisi birbirine karışıyordu.
   */
  ctx.textAlign = "right";
  ctx.font = `700 15px ${TEXT}`;
  ctx.fillStyle = "rgba(232,238,247,0.45)";
  // Harf aralığı canvas'ta doğrudan yok; kelimeyi harf harf yazıp aralık veriyoruz.
  const etiketMetni = "ÖDENEN BEDEL";
  let ex = W - pad;
  for (const ch of [...etiketMetni].reverse()) {
    ctx.fillText(ch, ex, altY - 4);
    ex -= ctx.measureText(ch).width + 2.4;
  }

  const tutar = data.price.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  ctx.font = `800 66px ${MONO}`;
  const tutarW = ctx.measureText(tutar).width;
  ctx.font = `700 40px ${MONO}`;
  const dolarW = ctx.measureText("$").width;

  // Dolar işareti rakamdan küçük ve yukarıda: rakam kartın kahramanı kalsın.
  ctx.textAlign = "left";
  ctx.font = `700 40px ${MONO}`;
  ctx.fillStyle = alfa(renk, 0.75);
  ctx.fillText("$", W - pad - tutarW - dolarW - 5, altY + 22);

  ctx.font = `800 66px ${MONO}`;
  ctx.fillStyle = renk;
  ctx.shadowColor = alfa(renk, 0.55);
  ctx.shadowBlur = 26;
  ctx.fillText(tutar, W - pad - tutarW, altY + 48);
  ctx.shadowBlur = 0;

  /* -------------------------------- künye ---------------------------------- */
  const tarih = new Date(data.at ?? Date.now()).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  ctx.textAlign = "left";
  ctx.font = `600 17px ${TEXT}`;
  ctx.fillStyle = "rgba(232,238,247,0.34)";
  ctx.fillText(`${tarih} · partim.lol · bir siyaset simülasyonu oyunu`, pad, H - pad + 14);

  if (data.ornek) {
    // Gerçekleşmemiş satın alma işareti. Sadece nokta — anlamı biliniyor.
    ctx.beginPath();
    ctx.arc(W - pad, H - pad + 8, 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
  }

  ctx.restore();
}
