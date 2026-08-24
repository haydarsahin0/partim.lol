/**
 * İl başkanlığı kartı.
 *
 * Koltuğu alan kişinin paylaşabileceği görsel. Oyunun büyüme döngüsü bunun
 * üstünde: kişi parasının karşılığını göstermek için kartı kendi paylaşıyor,
 * takipçileri oyunu görüyor. Bu yüzden kart "ekran görüntüsü" değil, sosyal
 * medyanın istediği ölçüde (1200×675) ayrı çiziliyor.
 *
 * `ornek` işaretlendiğinde karta açıkça ÖRNEK damgası basılır. Gerçekleşmemiş
 * bir satın almayı olmuş gibi göstermek, sonra gerçekten para ödeyecek kişiyi
 * yanıltmak demek; damga bunun önüne geçiyor.
 */
import { PARTY_BY_ID, partyColor, partyShortName } from "@/data/parties";
import { PROVINCE_BY_ID } from "@/data/provinces";

export const KART_EN = 1200;
export const KART_BOY = 675;

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
  /** Açıkça örnek kart mı? */
  ornek?: boolean;
};

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

export function drawSeatCard(ctx: CanvasRenderingContext2D, data: SeatCardData): void {
  const province = PROVINCE_BY_ID[data.provinceId];
  const party = PARTY_BY_ID[data.partyId];
  const renk = partyColor(data.partyId);
  const W = KART_EN;
  const H = KART_BOY;

  ctx.save();
  ctx.fillStyle = "#060a12";
  ctx.fillRect(0, 0, W, H);

  // Parti renginde köşe ışığı — kart hangi partiye ait, bir bakışta belli olsun.
  const g1 = ctx.createRadialGradient(W * 0.78, H * 0.12, 0, W * 0.78, H * 0.12, W * 0.75);
  g1.addColorStop(0, alfa(renk, 0.42));
  g1.addColorStop(0.5, alfa(renk, 0.1));
  g1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  const g2 = ctx.createRadialGradient(W * 0.1, H * 0.95, 0, W * 0.1, H * 0.95, W * 0.6);
  g2.addColorStop(0, "rgba(34,211,238,0.16)");
  g2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  // Kenar çizgisi
  ctx.strokeStyle = alfa(renk, 0.35);
  ctx.lineWidth = 3;
  kutu(ctx, 1.5, 1.5, W - 3, H - 3, 28);
  ctx.stroke();

  const pad = 64;
  ctx.textBaseline = "alphabetic";

  /* --------------------------- üst: marka + etiket ------------------------- */
  ctx.textAlign = "left";
  ctx.font = '800 30px "SF Pro Display", Inter, system-ui, sans-serif';
  ctx.fillStyle = "rgba(232,238,247,0.92)";
  ctx.fillText("partim.lol", pad, pad + 12);

  const etiket = "İL BAŞKANI";
  ctx.font = '800 20px "SF Pro Text", Inter, system-ui, sans-serif';
  const etW = ctx.measureText(etiket).width + 34;
  ctx.fillStyle = alfa(renk, 0.22);
  kutu(ctx, W - pad - etW, pad - 14, etW, 40, 20);
  ctx.fill();
  ctx.strokeStyle = alfa(renk, 0.55);
  ctx.lineWidth = 1.5;
  kutu(ctx, W - pad - etW, pad - 14, etW, 40, 20);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = renk;
  ctx.fillText(etiket, W - pad - etW / 2, pad + 12);

  /* ------------------------------- parti rozeti ---------------------------- */
  const rozet = 118;
  const rx = pad;
  const ry = 152;
  ctx.fillStyle = renk;
  kutu(ctx, rx, ry, rozet, rozet, 30);
  ctx.fill();

  const parlak = ctx.createLinearGradient(rx, ry, rx, ry + rozet);
  parlak.addColorStop(0, "rgba(255,255,255,0.28)");
  parlak.addColorStop(0.6, "rgba(255,255,255,0)");
  ctx.fillStyle = parlak;
  kutu(ctx, rx, ry, rozet, rozet, 30);
  ctx.fill();

  const kisa = partyShortName(data.partyId);
  ctx.fillStyle = party?.on === "dark" ? "#0b0f19" : "#ffffff";
  ctx.font = `800 ${kisa.length > 3 ? 38 : 50}px "SF Pro Display", Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(kisa, rx + rozet / 2, ry + rozet / 2 + (kisa.length > 3 ? 14 : 18));

  /* -------------------------------- ana metin ------------------------------ */
  const mx = rx + rozet + 34;
  ctx.textAlign = "left";

  ctx.font = '600 26px "SF Pro Text", Inter, system-ui, sans-serif';
  ctx.fillStyle = "rgba(232,238,247,0.6)";
  ctx.fillText(party?.name ?? data.partyId, mx, ry + 34);

  ctx.font = '800 88px "SF Pro Display", Inter, system-ui, sans-serif';
  ctx.fillStyle = "#ffffff";
  ctx.fillText(province?.name ?? data.provinceId, mx, ry + 116);

  /* ------------------------------- kim + kaça ------------------------------ */
  const satirY = 400;
  ctx.font = '700 44px "SF Pro Display", Inter, system-ui, sans-serif';
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`@${data.handle}`, pad, satirY);

  ctx.font = '600 24px "SF Pro Text", Inter, system-ui, sans-serif';
  ctx.fillStyle = "rgba(232,238,247,0.6)";
  ctx.fillText(
    data.takeovers && data.takeovers > 0
      ? `koltuğu ${data.takeovers}. kez el değiştirerek aldı`
      : "bu koltuğun ilk başkanı",
    pad,
    satirY + 38,
  );

  // Bedel kutusu
  const bedel = `$${data.price.toLocaleString("tr-TR")}`;
  ctx.font = '800 76px "SF Mono", ui-monospace, monospace';
  const bW = ctx.measureText(bedel).width + 64;
  const bH = 118;
  const bX = W - pad - bW;
  const bY = satirY - 74;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  kutu(ctx, bX, bY, bW, bH, 26);
  ctx.fill();
  ctx.strokeStyle = alfa(renk, 0.4);
  ctx.lineWidth = 2;
  kutu(ctx, bX, bY, bW, bH, 26);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = renk;
  ctx.fillText(bedel, bX + bW / 2, bY + 84);
  ctx.font = '700 18px "SF Pro Text", Inter, system-ui, sans-serif';
  ctx.fillStyle = "rgba(232,238,247,0.5)";
  ctx.fillText("ÖDENEN BEDEL", bX + bW / 2, bY + 108);

  /* --------------------------------- altlık -------------------------------- */
  const altY = H - pad + 6;

  ctx.textAlign = "left";
  ctx.font = '600 21px "SF Pro Text", Inter, system-ui, sans-serif';
  ctx.fillStyle = "rgba(232,238,247,0.45)";
  const tarih = new Date(data.at ?? Date.now()).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  ctx.fillText(`${tarih} · partim.lol`, pad, altY);

  ctx.textAlign = "right";
  ctx.font = '600 19px "SF Pro Text", Inter, system-ui, sans-serif';
  ctx.fillStyle = "rgba(232,238,247,0.32)";
  ctx.fillText("Bir siyaset simülasyonu oyunu · gerçek seçim sonucu değildir", W - pad, altY);

  if (data.ornek) {
    /*
     * Örnek işareti.
     *
     * Önce çapraz iri bir damga ve alt şerit vardı; tasarımı eziyordu.
     * Şimdi sağ altta küçük bir nokta ve tek kelime. Yalnız nokta bırakmadık:
     * oyunun içinde nokta zaten "oyunun kendi hesabı" demek ve ipucu var,
     * ama bu kart tek başına dolaşıyor. Kartı gören biri koltuğun gerçekten
     * bu bedele satıldığını sanıp aynı seviyeden ödemeye kalkarsa parasıyla
     * yanılmış olur; tek kelime bunu engelliyor ve tasarımdan bir şey
     * götürmüyor.
     */
    const nokta = 7;
    const nx = W - pad;
    const ny = H - pad - 26;

    ctx.textAlign = "right";
    ctx.font = '600 17px "SF Pro Text", Inter, system-ui, sans-serif';
    ctx.fillStyle = "rgba(232,238,247,0.55)";
    ctx.fillText("örnek", nx - nokta * 2 - 8, ny + 6);

    ctx.beginPath();
    ctx.arc(nx - nokta, ny, nokta / 2 + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
  }

  ctx.restore();
}
