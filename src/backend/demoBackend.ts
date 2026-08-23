/**
 * Demo (vitrin) arka ucu — GitHub Pages'te sunucu olmadan da oyunun tamamı
 * oynanabilsin diye tarayıcının localStorage'ında çalışır.
 *
 * Kurallar gerçek arka uçla birebir aynıdır (saatlik oy, XP, koltuk fiyatı),
 * ama veriler yalnızca bu tarayıcıda durur ve gerçek ödeme alınmaz.
 */
import { PARTY_IDS } from "@/data/parties";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";
import { fallbackAvatar, hashString } from "@/lib/avatar";
import {
  LEADER_BASE_PRICE,
  VOTE_COOLDOWN_MS,
  XP_PER_LEADER_HOUR,
  XP_PER_VOTE,
  levelFromXp,
  nextLeaderPrice,
} from "@/lib/game";
import { buildRivals, buildSeed, type SeedSeats, type SeedVotes } from "./demoSeed";
import type {
  AuthUser,
  Backend,
  CheckoutResult,
  LeaderSeat,
  LeaderboardEntry,
  Profile,
  ProvinceDetail,
  ProvinceStanding,
  VoteResult,
} from "./types";

const KEY = "partim.lol/demo/v1";

type OwnedSeat = { price: number; heldSince: string; takeovers: number; xpPaidUntil: string };

type DemoState = {
  v: 1;
  user: AuthUser | null;
  xp: number;
  voteCount: number;
  nextVoteAt: string | null;
  createdAt: string;
  /** provinceId -> partyId -> kullanıcının eklediği oy */
  myVotes: Record<string, Record<string, number>>;
  /** provinceId -> partyId -> kullanıcının aldığı koltuk */
  mySeats: Record<string, Record<string, OwnedSeat>>;
  /** provinceId -> partyId -> tohumdan devralınıp boşaltılan koltuklar */
  releasedSeats: Record<string, string[]>;
  recent: Array<{ provinceId: string; handle: string; partyId: string; at: string }>;
};

function emptyState(): DemoState {
  return {
    v: 1,
    user: null,
    xp: 0,
    voteCount: 0,
    nextVoteAt: null,
    createdAt: new Date().toISOString(),
    myVotes: {},
    mySeats: {},
    releasedSeats: {},
    recent: [],
  };
}

function load(): DemoState {
  if (typeof localStorage === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as DemoState;
    if (parsed?.v !== 1) return emptyState();
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

function save(state: DemoState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* özel sekmede depolama kapalı olabilir — oyun bellekte devam eder */
  }
}

export class DemoBackend implements Backend {
  readonly mode = "demo" as const;

  private state: DemoState = load();
  private seed: { votes: SeedVotes; seats: SeedSeats };
  private listeners = new Set<(u: AuthUser | null) => void>();

  constructor() {
    this.seed = buildSeed(Date.now());
  }

  /* ---------------- kimlik ---------------- */

  async getUser(): Promise<AuthUser | null> {
    return this.state.user;
  }

  async signInWithTwitter(): Promise<void> {
    // Demo modda gerçek OAuth yok; arayüz kullanıcı adını sorup demoSignIn çağırır.
    await this.demoSignIn("");
  }

  /** Demo moda özel: kullanıcı adını alıp yerel bir oyuncu profili açar. */
  async demoSignIn(rawHandle: string): Promise<void> {
    const handle =
      (rawHandle || "").replace(/^@/, "").trim() ||
      `oyuncu${Math.floor(Math.random() * 9000 + 1000)}`;
    const user: AuthUser = {
      id: `demo:${hashString(handle)}`,
      handle,
      displayName: handle,
      avatarUrl: fallbackAvatar(handle),
    };
    // Kullanıcı değiştiyse ilerleme sıfırlansın
    if (this.state.user && this.state.user.handle !== handle) {
      this.state = { ...emptyState(), user };
    } else {
      this.state.user = user;
    }
    save(this.state);
    this.emit();
  }

  async signOut(): Promise<void> {
    this.state.user = null;
    save(this.state);
    this.emit();
  }

  onAuthChange(cb: (user: AuthUser | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    for (const cb of this.listeners) cb(this.state.user);
  }

  /* ---------------- okuma ---------------- */

  private mergedVotes(provinceId: string): Record<string, number> {
    const base = { ...(this.seed.votes[provinceId] ?? {}) };
    const mine = this.state.myVotes[provinceId];
    if (mine) for (const [partyId, n] of Object.entries(mine)) base[partyId] = (base[partyId] ?? 0) + n;
    return base;
  }

  private standingFor(provinceId: string): ProvinceStanding {
    const row = this.mergedVotes(provinceId);
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    const tallies = Object.entries(row)
      .filter(([, v]) => v > 0)
      .map(([partyId, votes]) => ({
        partyId,
        votes,
        pct: total > 0 ? (votes / total) * 100 : 0,
      }))
      .sort((a, b) => b.votes - a.votes);
    return {
      provinceId,
      totalVotes: total,
      tallies,
      leadingPartyId: tallies[0]?.partyId ?? null,
      margin: tallies.length > 1 ? tallies[0].pct - tallies[1].pct : tallies.length === 1 ? 100 : 0,
    };
  }

  async getStandings(): Promise<Record<string, ProvinceStanding>> {
    const out: Record<string, ProvinceStanding> = {};
    for (const p of PROVINCES) out[p.id] = this.standingFor(p.id);
    return out;
  }

  private seatFor(provinceId: string, partyId: string): LeaderSeat {
    const mine = this.state.mySeats[provinceId]?.[partyId];
    if (mine && this.state.user) {
      return {
        provinceId,
        partyId,
        holder: this.state.user,
        price: mine.price,
        nextPrice: nextLeaderPrice(mine.price),
        heldSince: mine.heldSince,
        takeovers: mine.takeovers,
      };
    }
    const released = this.state.releasedSeats[provinceId]?.includes(partyId);
    const seeded = released ? undefined : this.seed.seats[provinceId]?.[partyId];
    if (seeded) {
      return {
        provinceId,
        partyId,
        holder: {
          id: `seed:${seeded.handle}`,
          handle: seeded.handle,
          displayName: seeded.displayName,
          avatarUrl: fallbackAvatar(seeded.handle),
        },
        price: seeded.price,
        nextPrice: nextLeaderPrice(seeded.price),
        heldSince: seeded.heldSince,
        takeovers: seeded.takeovers,
      };
    }
    return {
      provinceId,
      partyId,
      holder: null,
      price: 0,
      nextPrice: LEADER_BASE_PRICE,
      heldSince: null,
      takeovers: 0,
    };
  }

  async getProvinceDetail(provinceId: string): Promise<ProvinceDetail> {
    const standing = this.standingFor(provinceId);
    const seats = PARTY_IDS.map((partyId) => this.seatFor(provinceId, partyId));
    const recentVotes = this.state.recent
      .filter((r) => r.provinceId === provinceId)
      .slice(0, 12)
      .map(({ handle, partyId, at }) => ({ handle, partyId, at }));
    return { standing, seats, recentVotes };
  }

  async getMySeats(): Promise<LeaderSeat[]> {
    if (!this.state.user) return [];
    const out: LeaderSeat[] = [];
    for (const [provinceId, parties] of Object.entries(this.state.mySeats)) {
      for (const partyId of Object.keys(parties)) out.push(this.seatFor(provinceId, partyId));
    }
    return out.sort((a, b) => Date.parse(b.heldSince ?? "0") - Date.parse(a.heldSince ?? "0"));
  }

  /** İl başkanlığı süresince biriken XP'yi hesaplayıp işler. */
  private accrueLeaderXp(now = Date.now()): void {
    let gained = 0;
    for (const parties of Object.values(this.state.mySeats)) {
      for (const seat of Object.values(parties)) {
        const from = Date.parse(seat.xpPaidUntil);
        if (Number.isNaN(from)) {
          seat.xpPaidUntil = new Date(now).toISOString();
          continue;
        }
        const hours = Math.floor((now - from) / 3_600_000);
        if (hours > 0) {
          gained += hours * XP_PER_LEADER_HOUR;
          seat.xpPaidUntil = new Date(from + hours * 3_600_000).toISOString();
        }
      }
    }
    if (gained > 0) {
      this.state.xp += gained;
      save(this.state);
    }
  }

  async getProfile(): Promise<Profile | null> {
    if (!this.state.user) return null;
    this.accrueLeaderXp();
    const leaderCount = Object.values(this.state.mySeats).reduce(
      (n, parties) => n + Object.keys(parties).length,
      0,
    );
    return {
      ...this.state.user,
      xp: this.state.xp,
      level: levelFromXp(this.state.xp),
      voteCount: this.state.voteCount,
      leaderCount,
      nextVoteAt: this.state.nextVoteAt,
      createdAt: this.state.createdAt,
    };
  }

  async getLeaderboard(limit = 25): Promise<LeaderboardEntry[]> {
    const rivals: LeaderboardEntry[] = buildRivals(this.seed.seats, Date.now()).map((r) => ({
      user: {
        id: `seed:${r.handle}`,
        handle: r.handle,
        displayName: r.displayName,
        avatarUrl: fallbackAvatar(r.handle),
      },
      xp: r.xp,
      level: levelFromXp(r.xp),
      voteCount: r.voteCount,
      leaderCount: r.leaderCount,
    }));

    const me = await this.getProfile();
    if (me) {
      rivals.push({
        user: { id: me.id, handle: me.handle, displayName: me.displayName, avatarUrl: me.avatarUrl },
        xp: me.xp,
        level: me.level,
        voteCount: me.voteCount,
        leaderCount: me.leaderCount,
      });
    }
    return rivals.sort((a, b) => b.xp - a.xp).slice(0, limit);
  }

  /* ---------------- eylemler ---------------- */

  async castVote(provinceId: string, partyId: string): Promise<VoteResult> {
    if (!this.state.user) return { ok: false, message: "Önce giriş yapmalısın." };
    if (!PROVINCE_BY_ID[provinceId]) return { ok: false, message: "Böyle bir il yok." };
    if (!PARTY_IDS.includes(partyId)) return { ok: false, message: "Böyle bir parti yok." };

    const now = Date.now();
    const next = this.state.nextVoteAt ? Date.parse(this.state.nextVoteAt) : 0;
    if (next > now) {
      return { ok: false, message: "Oy hakkın henüz dolmadı." };
    }

    const provinceVotes = (this.state.myVotes[provinceId] ??= {});
    provinceVotes[partyId] = (provinceVotes[partyId] ?? 0) + 1;
    this.state.voteCount += 1;
    this.state.xp += XP_PER_VOTE;
    this.state.nextVoteAt = new Date(now + VOTE_COOLDOWN_MS).toISOString();
    this.state.recent.unshift({
      provinceId,
      partyId,
      handle: this.state.user.handle,
      at: new Date(now).toISOString(),
    });
    this.state.recent = this.state.recent.slice(0, 80);
    save(this.state);

    return {
      ok: true,
      profile: (await this.getProfile()) ?? undefined,
      standing: this.standingFor(provinceId),
    };
  }

  async claimSeat(provinceId: string, partyId: string): Promise<CheckoutResult> {
    if (!this.state.user) return { kind: "error", message: "Önce giriş yapmalısın." };
    const seat = this.seatFor(provinceId, partyId);
    if (seat.holder?.id === this.state.user.id) {
      return { kind: "error", message: "Bu koltuk zaten senin." };
    }

    const now = new Date().toISOString();
    // Tohum sahibinden devralındıysa o kaydı geçersizleştir
    if (seat.holder && seat.holder.id.startsWith("seed:")) {
      const list = (this.state.releasedSeats[provinceId] ??= []);
      if (!list.includes(partyId)) list.push(partyId);
    }
    (this.state.mySeats[provinceId] ??= {})[partyId] = {
      price: seat.nextPrice,
      heldSince: now,
      takeovers: seat.takeovers + 1,
      xpPaidUntil: now,
    };
    save(this.state);

    const profile = await this.getProfile();
    return { kind: "done", seat: this.seatFor(provinceId, partyId), profile: profile! };
  }
}
