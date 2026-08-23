/**
 * Demo modun başlangıç tablosu. Gerçek bir veritabanı yokken de harita dolu ve
 * inandırıcı görünsün diye bölgesel eğilimlere göre deterministik olarak üretilir.
 * Aynı tarayıcı aynı sonucu görür; kullanıcının kendi oyları bunun üstüne yazılır.
 */
import { PROVINCES } from "@/data/provinces";
import { buildSeedTallies } from "@/data/seedShares";
import { seededRng, pick } from "@/lib/rng";

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

  // Ülke geneli yüzdeleri canlı veritabanındakiyle aynı kaynaktan gelir.
  const tallies = buildSeedTallies();

  for (const province of PROVINCES) {
    const rng = seededRng(`partim:${province.id}:v1`);
    const row = tallies[province.id] ?? {};
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    votes[province.id] = row;

    // İl başkanlıkları: güçlü partilerin koltukları dolu olma eğiliminde
    const provinceSeats: Record<string, SeedSeat> = {};
    const ranked = Object.entries(row).sort((a, b) => b[1] - a[1]);
    for (const [partyId, partyVotes] of ranked) {
      const share = partyVotes / Math.max(1, total);
      const chance = Math.min(0.85, share * 1.9 + 0.06);
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
