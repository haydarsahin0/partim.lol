/**
 * Renk yardımcıları.
 *
 * Haritada partiler yalnızca renkleriyle ayırt ediliyor; iki parti birbirine
 * yakın tonlar seçerse harita okunamaz hâle gelir. Bu yüzden yakınlığı gözle
 * değil OKLab'de ölçüyoruz: RGB'deki sayısal uzaklık algısal uzaklığa denk
 * gelmiyor (ör. iki yeşil RGB'de uzak, gözde aynı olabiliyor).
 */

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1).toUpperCase()}`;
}

const srgbToLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** OKLab: algısal olarak düzgün renk uzayı */
export function toOklab(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * İki renk arasındaki algısal uzaklık.
 *
 * Aydınlık farkını 0.6 ile ölçekliyoruz: haritada asıl karışma kaynağı
 * ton benzerliği, aynı tonun açık/koyu hâlleri gözle daha kolay ayrılıyor.
 */
export function colorDistance(a: string, b: string): number {
  const la = toOklab(a);
  const lb = toOklab(b);
  if (!la || !lb) return Number.POSITIVE_INFINITY;
  const dL = (la[0] - lb[0]) * 0.6;
  const dA = la[1] - lb[1];
  const dB = la[2] - lb[2];
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
}

/**
 * Yeni bir parti renginin mevcut renklerden ayırt edilebilmesi için gereken
 * en küçük uzaklık. Değer deneyerek bulundu: 0.08'in altındaki çiftler
 * haritada yan yana geldiğinde ayırt edilemiyor.
 */
export const MIN_COLOR_DISTANCE = 0.09;

export type ColorCheck =
  | { ok: true }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "too-close"; conflictsWith: string; distance: number }
  | { ok: false; reason: "too-dark" }
  | { ok: false; reason: "too-pale" };

/** Seçilen rengin hem geçerli hem de kullanılabilir olup olmadığını söyler. */
export function checkPartyColor(
  hex: string,
  taken: Array<{ name: string; color: string }>,
): ColorCheck {
  const lab = toOklab(hex);
  if (!lab) return { ok: false, reason: "invalid" };

  // Çok koyu renkler haritada boş ilden ayrılmıyor.
  if (lab[0] < 0.35) return { ok: false, reason: "too-dark" };
  // Çok soluk/açık renkler ise seçili il vurgusuyla karışıyor.
  if (lab[0] > 0.9) return { ok: false, reason: "too-pale" };

  let nearest: { name: string; distance: number } | null = null;
  for (const other of taken) {
    const distance = colorDistance(hex, other.color);
    if (!nearest || distance < nearest.distance) nearest = { name: other.name, distance };
  }

  if (nearest && nearest.distance < MIN_COLOR_DISTANCE) {
    return {
      ok: false,
      reason: "too-close",
      conflictsWith: nearest.name,
      distance: nearest.distance,
    };
  }
  return { ok: true };
}

/** Kullanıcıya gösterilecek açıklama */
export function describeColorCheck(check: ColorCheck): string | null {
  if (check.ok) return null;
  switch (check.reason) {
    case "invalid":
      return "Geçerli bir renk seç.";
    case "too-dark":
      return "Bu renk fazla koyu; haritada boş illerden ayrılmaz.";
    case "too-pale":
      return "Bu renk fazla açık; haritada seçili il vurgusuyla karışır.";
    case "too-close":
      return `Bu renk ${check.conflictsWith} rengine çok yakın. Haritada karışmaması için farklı bir ton seç.`;
  }
}

/**
 * Verilen renge en yakın, kuralları geçen alternatifleri döner.
 * Kullanıcı reddedilen bir renk seçtiğinde ona yol göstermek için.
 */
export function suggestColors(
  hex: string,
  taken: Array<{ name: string; color: string }>,
  count = 4,
): string[] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [];
  const out: string[] = [];
  // Ton çemberinde dolaşarak ilk uygun adayları topla
  for (let step = 1; step <= 36 && out.length < count; step++) {
    const angle = (step * 40 * Math.PI) / 180;
    const candidate = rotateHue(hex, angle);
    if (checkPartyColor(candidate, taken).ok && !out.includes(candidate)) {
      out.push(candidate);
    }
  }
  return out;
}

/** Basit YIQ ton döndürme — öneri üretmek için yeterli */
function rotateHue(hex: string, angle: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { r, g, b } = rgb;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const i = 0.596 * r - 0.274 * g - 0.322 * b;
  const q = 0.211 * r - 0.523 * g + 0.312 * b;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const i2 = i * cos - q * sin;
  const q2 = i * sin + q * cos;
  return rgbToHex({
    r: y + 0.956 * i2 + 0.621 * q2,
    g: y - 0.272 * i2 - 0.647 * q2,
    b: y - 1.106 * i2 + 1.703 * q2,
  });
}
