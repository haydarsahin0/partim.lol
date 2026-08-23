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

/**
 * Toplam açılış oyu. Gerçek oylar bunun üstüne eklenir.
 *
 * Küçük tutuluyor: yeni açılmış bir oyunda yüz binlerce oy görmek inandırıcı
 * değil. Bunun bedeli yuvarlamada: 365 oyda bir oy %0,27 ettiği için parti
 * yüzdeleri hedeflerine en fazla yarım oy (~0,14 puan) uzaklıkta oturabilir.
 */
export const SEED_TOTAL_VOTES = 365;

/**
 * Bölgesel eğilim çarpanları. Yalnızca oyun ülke içindeki dağılımını
 * değiştirir; ülke yüzdesini değil.
 */
const REGION_TILT: Record<string, Record<string, number>> = {
  Marmara: { chp: 3.6, iyi: 2.2, zafer: 1.8, memleket: 1.3, dem: 0.7, hudapar: 0.2, mhp: 0.7, akp: 0.85, yeni: 1.1 },
  Ege: { chp: 8.0, iyi: 3.2, memleket: 2.0, tip: 1.8, zafer: 1.3, dem: 0.2, hudapar: 0.1, akp: 0.62, yeni: 0.9 },
  Akdeniz: { chp: 3.0, mhp: 3.0, iyi: 1.6, memleket: 1.2, dem: 0.7, hudapar: 0.3, akp: 0.8, yeni: 1.0 },
  "İç Anadolu": { mhp: 3.2, sp: 1.6, bbp: 1.7, yeni: 1.45, dem: 0.25, hudapar: 0.2, chp: 0.5, iyi: 0.8 },
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
  // 0.25 – 2.55 arası. Bilerek çok geniş: aralık dar kaldığında en büyük parti
  // neredeyse her ilde önde bitiyor ve harita tek renge dönüyor. Ülke
  // yüzdelerini bozmuyor — dağıtım en büyük kalan yöntemiyle yapıldığı için
  // her partinin ülke toplamı sabit kalır, yalnızca illere dağılımı değişir.
  return 0.25 + ((h >>> 0) % 1000) / 1000 * 2.3;
}

/**
 * Açılış oyunun dağıtılacağı il sayısı.
 *
 * 365 oyu 81 ile bölünce il başına 4 oy düşüyor ve "önde olan parti" tek bir
 * oyla belirleniyordu: en büyük parti 74 ili kazanıp harita tek renge
 * dönüyordu. Oyu daha az ile toplayınca o illerde gerçek bir yarış oluşuyor,
 * kalanlar ise dürüstçe boş kalıyor — yeni açılmış bir oyunda zaten böyle
 * görünmesi gerekir ve boş iller ilk oyu vermek için davetiye.
 */
export const SEED_ACTIVE_PROVINCES = 26;

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

  // Oy hangi illere dağıtılacak? Nüfusu büyük iller öne çıkar, gürültü
  // sıralamayı biraz karıştırır ki liste hep aynı klişe illerden ibaret olmasın.
  const active = [...PROVINCES]
    .map((province) => ({
      province,
      w: (POP_WEIGHT[province.id] ?? 1) * jitter(province.id, "aktiflik"),
    }))
    .sort((a, b) => b.w - a.w)
    .slice(0, Math.min(SEED_ACTIVE_PROVINCES, PROVINCES.length))
    .map((row) => row.province);

  const partyIds = Object.keys(NATIONAL_SHARES);

  // 1) Parti başına ülke toplamı — burada da en büyük kalan yöntemi.
  //
  // Önce yuvarlayıp artığı tek bir partiye yüklemek yanlıştı: 365 oyda tek tek
  // yuvarlamalar toplamı aştığında fark en büyük partiden düşüyor ve AK Parti
  // %31,8 yerine %31,2 çıkıyordu. Bu yöntemde her parti kendi tam payına en
  // fazla bir oy uzakta kalır.
  const counts: Record<string, number> = {};
  const exactCounts: Record<string, number> = {};
  let assigned = 0;
  for (const partyId of partyIds) {
    exactCounts[partyId] = (NATIONAL_SHARES[partyId] / 100) * total;
    counts[partyId] = Math.floor(exactCounts[partyId]);
    assigned += counts[partyId];
  }
  const byFraction = [...partyIds].sort(
    (a, b) =>
      exactCounts[b] - Math.floor(exactCounts[b]) - (exactCounts[a] - Math.floor(exactCounts[a])),
  );
  for (let i = 0; assigned < total; i++) {
    counts[byFraction[i % byFraction.length]] += 1;
    assigned += 1;
  }

  // 2) Her partinin toplamını illere böl (en büyük kalan yöntemi).
  for (const partyId of partyIds) {
    const weights = active.map((province) => {
      const tilt = REGION_TILT[province.region]?.[partyId] ?? 1;
      // Nüfus ağırlığının karekökü: 365 oyda ham çarpanla İstanbul tek başına
      // payın çoğunu alıp Anadolu'nun yarısı boş kalıyordu.
      const pop = Math.sqrt(POP_WEIGHT[province.id] ?? 1);
      return pop * tilt * jitter(province.id, partyId);
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

    active.forEach((province, index) => {
      if (floors[index] > 0) out[province.id][partyId] = floors[index];
    });
  }

  return out;
}
