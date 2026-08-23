/**
 * Açılış oy dağılımı.
 *
 * Oyun boş bir tabloyla açılınca harita gri ve ölü görünüyor. Başlangıç
 * tablosu bu yüzden var: haritayı doldurur, gerçek oyların üstüne yazılacağı
 * bir zemin kurar.
 *
 * TEK KAYNAK burasıdır. Aynı algoritma iki yerde kullanılır:
 *   - demo mod (Supabase yokken tarayıcıda),
 *   - `scripts/generate-seed-sql.mjs` ile üretilen SQL migration'ı.
 * Yüzdeler iki yerde ayrı ayrı yazılsaydı er geç birbirinden ayrılırdı.
 *
 * Ülke geneli yüzdeleri TAM tutturulur: her parti için ülke toplamı önce
 * hesaplanır, sonra en büyük kalan yöntemiyle (largest remainder) illere
 * bölünür. Bölgesel eğilim ve il bazlı gürültü yalnızca dağılımı değiştirir,
 * toplamı değiştirmez — yani harita bölge bölge farklı görünürken üstteki
 * ülke çubuğu istenen yüzdeleri gösterir.
 */
import { PROVINCES } from "@/data/provinces";

/** Ülke geneli hedef yüzdeler. Toplamı 100. */
export const NATIONAL_SHARES: Record<string, number> = {
  akp: 31.8,
  yeni: 21.0,
  mhp: 8.4,
  iyi: 6.1,
  yrp: 4.6,
  dem: 4.2,
  memleket: 3.5,
  anahtar: 3.1,
  chp: 3.0,
  tip: 2.7,
  sp: 2.4,
  deva: 2.1,
  gelecek: 1.9,
  dp: 1.6,
  bbp: 1.3,
  zafer: 1.3,
  hudapar: 1.0,
};

/** Toplam açılış oyu. Gerçek oylar bunun üstüne eklenir. */
export const SEED_TOTAL_VOTES = 128_000;

/**
 * Bölgesel eğilim çarpanları. Yalnızca oyun ülke içindeki dağılımını
 * değiştirir; ülke yüzdesini değil.
 */
const REGION_TILT: Record<string, Record<string, number>> = {
  Marmara: { chp: 2.4, iyi: 1.7, zafer: 1.8, memleket: 1.3, dem: 0.7, hudapar: 0.2, mhp: 0.7, akp: 0.85, yeni: 1.1 },
  Ege: { chp: 5.2, iyi: 2.2, memleket: 2.0, tip: 1.8, zafer: 1.3, dem: 0.2, hudapar: 0.1, akp: 0.62, yeni: 0.9 },
  Akdeniz: { chp: 2.2, mhp: 2.1, iyi: 1.6, memleket: 1.2, dem: 0.7, hudapar: 0.3, akp: 0.8, yeni: 1.0 },
  "İç Anadolu": { mhp: 2.3, sp: 1.6, bbp: 1.7, yeni: 1.45, dem: 0.25, hudapar: 0.2, chp: 0.5, iyi: 0.8 },
  Karadeniz: { yeni: 1.6, bbp: 1.8, dp: 1.6, mhp: 1.4, dem: 0.15, hudapar: 0.15, chp: 0.45, tip: 0.5 },
  "Doğu Anadolu": { dem: 6.5, hudapar: 4.0, sp: 1.5, yeni: 0.9, chp: 0.35, iyi: 0.5, akp: 0.9 },
  "Güneydoğu Anadolu": { dem: 15.0, hudapar: 6.5, yrp: 1.6, sp: 1.7, chp: 0.25, iyi: 0.3, mhp: 0.25, akp: 0.75, yeni: 0.7 },
};

/** Nüfusu büyük illerde oy hacmi de büyük olsun */
const POP_WEIGHT: Record<string, number> = {
  istanbul: 9, ankara: 4.4, izmir: 3.6, bursa: 2.1, antalya: 1.9, konya: 1.6,
  adana: 1.6, sanliurfa: 1.5, gaziantep: 1.5, kocaeli: 1.5, mersin: 1.4,
  diyarbakir: 1.3, hatay: 1.2, manisa: 1.15, kayseri: 1.15, samsun: 1.1,
  balikesir: 1.1, kahramanmaras: 1.05, van: 1.05, aydin: 1.05, denizli: 1,
};

/** Bağımsız, deterministik gürültü — aynı girdi hep aynı sayıyı verir. */
function jitter(provinceId: string, partyId: string): number {
  let h = 2166136261;
  const input = `${provinceId}|${partyId}|v2`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 0.40 – 1.90 arası. Geniş tutuluyor: aralık dar kaldığında en büyük parti
  // 81 ilin neredeyse hepsinde önde bitiyor ve harita tek renge dönüyordu.
  // Ülke yüzdelerini bozmuyor — dağıtım en büyük kalan yöntemiyle yapılıyor.
  return 0.4 + ((h >>> 0) % 1000) / 1000 * 1.5;
}

export type SeedTallies = Record<string, Record<string, number>>;

/**
 * Ülke geneli yüzdeleri birebir tutturan il bazlı tablo üretir.
 *
 * Her parti kendi ülke toplamını illere böler; bölme artıkları en büyük
 * kalandan başlayarak dağıtılır, böylece parti toplamı yuvarlama yüzünden
 * kaymaz.
 */
export function buildSeedTallies(total = SEED_TOTAL_VOTES): SeedTallies {
  const out: SeedTallies = {};
  for (const province of PROVINCES) out[province.id] = {};

  const partyIds = Object.keys(NATIONAL_SHARES);

  // 1) Parti başına ülke toplamı — yuvarlama artığı en büyük partiye eklenir.
  const counts: Record<string, number> = {};
  let assigned = 0;
  for (const partyId of partyIds) {
    counts[partyId] = Math.round((NATIONAL_SHARES[partyId] / 100) * total);
    assigned += counts[partyId];
  }
  const biggest = partyIds.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  counts[biggest] += total - assigned;

  // 2) Her partinin toplamını illere böl (en büyük kalan yöntemi).
  for (const partyId of partyIds) {
    const weights = PROVINCES.map((province) => {
      const tilt = REGION_TILT[province.region]?.[partyId] ?? 1;
      return (POP_WEIGHT[province.id] ?? 1) * tilt * jitter(province.id, partyId);
    });
    const sum = weights.reduce((a, b) => a + b, 0);

    const exact = weights.map((w) => (w / sum) * counts[partyId]);
    const floors = exact.map(Math.floor);
    let remaining = counts[partyId] - floors.reduce((a, b) => a + b, 0);

    const order = exact
      .map((value, index) => ({ index, frac: value - Math.floor(value) }))
      .sort((a, b) => b.frac - a.frac);
    for (const { index } of order) {
      if (remaining <= 0) break;
      floors[index] += 1;
      remaining -= 1;
    }

    PROVINCES.forEach((province, index) => {
      if (floors[index] > 0) out[province.id][partyId] = floors[index];
    });
  }

  return out;
}
