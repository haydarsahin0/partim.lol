/**
 * Demo modun başlangıç tablosu. Gerçek bir veritabanı yokken de harita dolu ve
 * inandırıcı görünsün diye bölgesel eğilimlere göre deterministik olarak üretilir.
 * Aynı tarayıcı aynı sonucu görür; kullanıcının kendi oyları bunun üstüne yazılır.
 */
import { PROVINCES } from "@/data/provinces";
import { PARTY_IDS } from "@/data/parties";
import { seededRng, pick } from "@/lib/rng";

/** Bölge bazlı taban ağırlıklar (yüzde değil, göreli ağırlık) */
const REGION_WEIGHTS: Record<string, Record<string, number>> = {
  Marmara: { chp: 34, akp: 28, iyi: 9, mhp: 8, dem: 5, yrp: 4, zafer: 3, tip: 2, sp: 1.5, deva: 1.5, gelecek: 1, dp: 1, bbp: 0.8, memleket: 1, hudapar: 0.4 },
  Ege: { chp: 38, akp: 25, iyi: 10, mhp: 9, yrp: 4, zafer: 3, tip: 2.5, dem: 2, memleket: 1.5, sp: 1.2, deva: 1.2, gelecek: 1, dp: 1, bbp: 0.8, hudapar: 0.3 },
  Akdeniz: { chp: 31, akp: 28, mhp: 12, iyi: 9, dem: 5, yrp: 4, zafer: 2.5, tip: 2, sp: 1.4, deva: 1.3, gelecek: 1, dp: 1, memleket: 1, bbp: 0.8, hudapar: 0.5 },
  "İç Anadolu": { akp: 35, chp: 24, mhp: 15, iyi: 8, yrp: 5, sp: 2.5, zafer: 2.2, dem: 2, bbp: 1.6, deva: 1.2, gelecek: 1.1, dp: 1, tip: 1, memleket: 0.8, hudapar: 0.4 },
  Karadeniz: { akp: 39, chp: 22, mhp: 13, iyi: 7, yrp: 5, sp: 2.4, zafer: 2, bbp: 1.8, dem: 1.6, deva: 1.2, gelecek: 1.1, dp: 1, tip: 0.9, memleket: 0.8, hudapar: 0.4 },
  "Doğu Anadolu": { akp: 32, dem: 21, chp: 14, mhp: 10, yrp: 6, iyi: 5, hudapar: 3, sp: 2.4, bbp: 1.6, zafer: 1.4, deva: 1.2, gelecek: 1, dp: 0.8, tip: 0.8, memleket: 0.6 },
  "Güneydoğu Anadolu": { dem: 37, akp: 29, yrp: 7, chp: 8, hudapar: 5, sp: 3, mhp: 3, iyi: 2.5, tip: 1.6, deva: 1.4, gelecek: 1.2, dp: 0.8, zafer: 0.7, bbp: 0.6, memleket: 0.5 },
};

/** Nüfusu belirgin şekilde büyük illerde oy hacmi de büyük olsun */
const POP_BOOST: Record<string, number> = {
  istanbul: 9, ankara: 4.4, izmir: 3.6, bursa: 2.1, antalya: 1.9, konya: 1.6,
  adana: 1.6, sanliurfa: 1.5, gaziantep: 1.5, kocaeli: 1.5, mersin: 1.4,
  diyarbakir: 1.3, hatay: 1.2, manisa: 1.15, "kayseri": 1.15, samsun: 1.1,
  balikesir: 1.1, "kahramanmaras": 1.05, "van": 1.05, aydin: 1.05, denizli: 1.0,
};

export const HANDLE_STEMS = [
  "anadolu", "sancak", "meydan", "kalem", "boga", "poyraz", "lodos", "sahaf",
  "cinar", "kervan", "yildiz", "safak", "deniz", "kartal", "efe", "zeybek",
  "gurbet", "pusula", "mecra", "sokak", "vira", "berkin", "kule", "arsiv",
  "mavi", "kizil", "turkuaz", "bozkir", "yamac", "iskele",
];
const HANDLE_TAILS = ["", "_", "34", "06", "35", "tr", "01", "x", "_tr", "61", "27", "44"];

export type SeedVotes = Record<string, Record<string, number>>;
export type SeedSeat = {
  handle: string;
  displayName: string;
  price: number;
  heldSince: string;
  takeovers: number;
};
/** provinceId -> partyId -> koltuk */
export type SeedSeats = Record<string, Record<string, SeedSeat>>;

function fakeHandle(rng: () => number): string {
  return `${pick(rng, HANDLE_STEMS)}${pick(rng, HANDLE_TAILS)}${
    rng() < 0.35 ? Math.floor(rng() * 90 + 10) : ""
  }`;
}

function displayNameFor(handle: string, rng: () => number): string {
  const first = pick(rng, ["Deniz", "Ela", "Kerem", "Aslı", "Mert", "Zeynep", "Barış", "Ceren", "Emre", "Naz", "Onur", "Sena", "Tolga", "Yağmur", "Umut"]);
  const last = pick(rng, ["Yılmaz", "Demir", "Kaya", "Şahin", "Çelik", "Aydın", "Öztürk", "Arslan", "Doğan", "Kurt", "Koç", "Aksoy"]);
  return rng() < 0.3 ? `@${handle}` : `${first} ${last}`;
}

export function buildSeed(now: number): { votes: SeedVotes; seats: SeedSeats } {
  const votes: SeedVotes = {};
  const seats: SeedSeats = {};

  for (const province of PROVINCES) {
    const rng = seededRng(`partim:${province.id}:v1`);
    const base = REGION_WEIGHTS[province.region] ?? REGION_WEIGHTS["İç Anadolu"];

    // Toplam oy hacmi: nüfus çarpanı + ile özel dalgalanma
    const boost = POP_BOOST[province.id] ?? 1;
    const total = Math.round((260 + rng() * 900) * boost);

    // Ağırlıkları ile özel gürültüyle dalgalandır
    const noisy: Record<string, number> = {};
    let sum = 0;
    for (const partyId of PARTY_IDS) {
      const w = (base[partyId] ?? 0.4) * (0.6 + rng() * 0.85);
      noisy[partyId] = w;
      sum += w;
    }

    const row: Record<string, number> = {};
    let assigned = 0;
    for (const partyId of PARTY_IDS) {
      const v = Math.floor((noisy[partyId] / sum) * total);
      if (v > 0) row[partyId] = v;
      assigned += v;
    }
    // Yuvarlamadan artan oyları lidere ekle
    const lead = Object.entries(row).sort((a, b) => b[1] - a[1])[0];
    if (lead && total - assigned > 0) row[lead[0]] += total - assigned;
    votes[province.id] = row;

    // İl başkanlıkları: güçlü partilerin koltukları dolu olma eğiliminde
    const provinceSeats: Record<string, SeedSeat> = {};
    const ranked = Object.entries(row).sort((a, b) => b[1] - a[1]);
    for (const [partyId, partyVotes] of ranked) {
      const share = partyVotes / Math.max(1, total);
      const chance = Math.min(0.85, share * 1.9 + boost * 0.03);
      if (rng() > chance) continue;
      const handle = fakeHandle(rng);
      const takeovers = Math.floor(rng() * rng() * 6);
      provinceSeats[partyId] = {
        handle,
        displayName: displayNameFor(handle, rng),
        price: 1 + takeovers,
        heldSince: new Date(now - Math.floor(rng() * 96 + 1) * 3600_000).toISOString(),
        takeovers,
      };
    }
    seats[province.id] = provinceSeats;
  }

  return { votes, seats };
}

/** Sıralama tablosunu doldurmak için sahte rakipler */
export function buildRivals(seats: SeedSeats, now: number) {
  const rng = seededRng("partim:rivals:v1");
  const owners = new Map<string, { handle: string; displayName: string; seats: number; heldHours: number }>();
  for (const provinceSeats of Object.values(seats)) {
    for (const seat of Object.values(provinceSeats)) {
      const prev = owners.get(seat.handle);
      const hours = Math.max(1, Math.floor((now - Date.parse(seat.heldSince)) / 3600_000));
      if (prev) {
        prev.seats += 1;
        prev.heldHours += hours;
      } else {
        owners.set(seat.handle, {
          handle: seat.handle,
          displayName: seat.displayName,
          seats: 1,
          heldHours: hours,
        });
      }
    }
  }
  return [...owners.values()].map((o) => {
    const voteCount = Math.floor(rng() * 400) + o.seats * 12;
    return {
      handle: o.handle,
      displayName: o.displayName,
      voteCount,
      leaderCount: o.seats,
      xp: voteCount + o.heldHours * 20,
    };
  });
}
