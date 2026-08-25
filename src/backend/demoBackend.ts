/**
 * Demo (vitrin) arka ucu — GitHub Pages'te sunucu olmadan da oyunun tamamı
 * oynanabilsin diye tarayıcının localStorage'ında çalışır.
 *
 * Kurallar gerçek arka uçla birebir aynıdır (saatlik oy, XP, koltuk fiyatı),
 * ama veriler yalnızca bu tarayıcıda durur ve gerçek ödeme alınmaz.
 */
import { PARTIES, PARTY_IDS, setCustomParties, takenColors } from "@/data/parties";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";
import { fallbackAvatar, hashString } from "@/lib/avatar";
import {
  generateRecoveryCode,
  getDeviceIdentity,
  normalizeRecoveryCode,
  type DeviceIdentity,
} from "@/lib/device";
import { pick, seededRng } from "@/lib/rng";
import { syntheticHistory } from "@/lib/timelapse";
import {
  FAST_VOTE_COOLDOWN_MS,
  LEADER_BASE_PRICE,
  RALLY_COOLDOWN_MS,
  RALLY_VOTES,
  checkLeaderBid,
  hasFastVotes,
  hasUnlimitedVotes,
  voteCooldownMs,
  XP_PER_LEADER_HOUR,
  XP_PER_VOTE,
  levelFromXp,
  minLeaderPrice,
} from "@/lib/game";
import { readableTextTone } from "@/data/parties";
import type { Party } from "@/data/parties";
import { PARTY_SHORT_MAX, PARTY_SHORT_MIN } from "@/lib/game";
import { checkPartyColor, describeColorCheck } from "@/lib/color";
import {
  HANDLE_STEMS,
  buildRivals,
  buildSeed,
  type SeedSeats,
  type SeedVotes,
} from "./demoSeed";
import type {
  AuthUser,
  Backend,
  CheckoutResult,
  CreatePartyResult,
  CustomPartyInput,
  ProfilePatch,
  ProfileUpdateResult,
  SiteStats,
  LeaderSeat,
  LeaderboardEntry,
  Profile,
  ProvinceDetail,
  LiveVote,
  FastVotesResult,
  ProvinceStanding,
  RallyResult,
  VoteHistory,
  SeatMarketSummary,
  VoteResult,
} from "./types";

const KEY = "partim.lol/demo/v1";

type OwnedSeat = {
  price: number;
  heldSince: string;
  takeovers: number;
  xpPaidUntil: string;
  /** Son mitingin anı (ISO). Yoksa hak hazır. */
  lastRallyAt?: string;
};

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
  /** Kullanıcının kurduğu partiler */
  customParties: Party[];
  /** Tarayıcı verisi silinirse hesabı geri almaya yarayan kod */
  recoveryCode: string | null;
  /** Hesabın bağlı olduğu cihaz kimliği */
  deviceId: string | null;
  /** Sahip kodu girilmiş mi? Demo modda veri zaten yalnızca bu tarayıcıda. */
  unlimitedVotes: boolean;
  /** Hızlı oy aboneliğinin bittiği an (ISO) */
  fastVotesUntil: string | null;
  /** Bağlı kimlik sağlayıcısı ("google") */
  linkedProvider: string | null;
  /** Hızlı oy aboneliğinin başladığı an (ISO) */
  fastVotesSince: string | null;
  recent: Array<{
    provinceId: string;
    handle: string;
    partyId: string;
    at: string;
    source?: "vote" | "rally";
  }>;
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
    customParties: [],
    recoveryCode: null,
    deviceId: null,
    unlimitedVotes: false,
    fastVotesUntil: null,
    linkedProvider: null,
    fastVotesSince: null,
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
  /** Demo rakiplerinin kullanıcı adları; bir kez kurulur. */
  private alinmisAdlar: Set<string> | null = null;

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

  /**
   * Giriş ekranı yok: ilk açılışta hesap kendiliğinden açılır, sonraki
   * ziyaretlerde cihazdaki kimlikten devam eder.
   */
  async ensureSession(_device: DeviceIdentity): Promise<Profile | null> {
    /*
     * Hesap ARTIK KENDİLİĞİNDEN AÇILMIYOR — gerçek moddaki davranışın aynısı.
     * Ziyaretçi haritayı geziyor; hesap ancak giriş yapınca açılıyor.
     */
    return this.state.user ? this.getProfile() : null;
  }

  /** Demo modda "giriş": gerçek bir sağlayıcı yok, hesabı burada açıyoruz. */
  private hesapAc(device: DeviceIdentity) {
    const handle = this.generateHandle();
    this.state = {
      ...emptyState(),
      user: {
        id: `cihaz:${hashString(device.deviceId)}`,
        handle,
        displayName: handle,
        avatarUrl: fallbackAvatar(handle),
        xHandle: null,
      },
      deviceId: device.deviceId,
      linkedProvider: "google",
      recoveryCode: generateRecoveryCode(),
    };
    save(this.state);
    this.emit();
  }

  /**
   * Demo modda paylaşılan veri yok — her şey bu tarayıcıda duruyor — bu yüzden
   * doğrulanacak bir sunucu kodu da yok. Alanın gerçek modda nasıl davrandığını
   * göstermek için makul uzunlukta her kod kabul edilir.
   */
  async checkHandle(handle: string) {
    const ad = handle.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(ad)) {
      return {
        ok: false,
        message: "Kullanıcı adı 3–20 karakter olmalı; harf, rakam ve alt çizgi.",
      };
    }
    if (this.state.user && ad.toLowerCase() === this.state.user.handle.toLowerCase()) {
      return { ok: true };
    }
    // Demo modda gerçek kullanıcı yok; tohum rakipleri gerçekçi bir çakışma
    // kaynağı olsun diye alınmış sayılıyor. Liste bir kez kuruluyor: her tuşta
    // yeniden üretmek kullanıcı adı kutusunu gözle görülür biçimde yavaşlatıyordu.
    this.alinmisAdlar ??= new Set(
      buildRivals(this.seed.seats, Date.now()).map((r) => r.handle.toLowerCase()),
    );
    return this.alinmisAdlar.has(ad.toLowerCase())
      ? { ok: false, message: "Bu kullanıcı adı alınmış." }
      : { ok: true };
  }

  async claimUnlimited(code: string): Promise<ProfileUpdateResult> {
    if (!this.state.user) return { ok: false, message: "Hesap bulunamadı." };
    if (code.trim().length < 8) return { ok: false, message: "Kod hatalı." };
    this.state.unlimitedVotes = true;
    this.state.nextVoteAt = null;
    save(this.state);
    this.emit();
    const profile = await this.getProfile();
    return profile ? { ok: true, profile } : { ok: false, message: "Profil okunamadı." };
  }

  /** Çakışmayan, okunabilir bir başlangıç kullanıcı adı üretir. */
  private generateHandle(): string {
    const rng = seededRng(`handle:${Date.now()}:${Math.random()}`);
    return `${pick(rng, HANDLE_STEMS)}${Math.floor(rng() * 9000 + 1000)}`;
  }

  async updateProfile(patch: ProfilePatch): Promise<ProfileUpdateResult> {
    const user = this.state.user;
    if (!user) return { ok: false, message: "Hesap bulunamadı." };

    if (patch.handle !== undefined) {
      const handle = patch.handle.trim().replace(/^@/, "");
      if (!/^[A-Za-z0-9_]{3,20}$/.test(handle)) {
        return {
          ok: false,
          message: "Kullanıcı adı 3–20 karakter olmalı; harf, rakam ve alt çizgi.",
        };
      }
      user.handle = handle;
    }

    if (patch.displayName !== undefined) {
      const displayName = patch.displayName.trim();
      if (displayName.length < 1 || displayName.length > 40) {
        return { ok: false, message: "Görünen ad 1–40 karakter olmalı." };
      }
      user.displayName = displayName;
    }

    if (patch.xHandle !== undefined) {
      const raw = (patch.xHandle ?? "").trim().replace(/^@/, "");
      if (raw && !/^[A-Za-z0-9_]{1,15}$/.test(raw)) {
        return { ok: false, message: "X kullanıcı adı en fazla 15 karakter olabilir." };
      }
      user.xHandle = raw || null;
    }

    if (patch.avatarUrl !== undefined) {
      user.avatarUrl = patch.avatarUrl || fallbackAvatar(user.handle);
    }

    save(this.state);
    this.emit();
    const profile = await this.getProfile();
    return profile ? { ok: true, profile } : { ok: false, message: "Profil okunamadı." };
  }

  async getRecoveryCode(): Promise<string | null> {
    if (!this.state.user) return null;
    if (!this.state.recoveryCode) {
      this.state.recoveryCode = generateRecoveryCode();
      save(this.state);
    }
    return this.state.recoveryCode;
  }

  async restoreAccount(code: string): Promise<ProfileUpdateResult> {
    // Demo modda veriler yalnızca bu tarayıcıda durduğu için kod ancak
    // buradaki hesaba aitse işe yarar. Gerçek modda sunucudaki hesabı bağlar.
    const stored = this.state.recoveryCode ? normalizeRecoveryCode(this.state.recoveryCode) : null;
    if (!stored || normalizeRecoveryCode(code) !== stored) {
      return { ok: false, message: "Kod bu tarayıcıdaki hesaba ait değil." };
    }
    const profile = await this.getProfile();
    return profile ? { ok: true, profile } : { ok: false, message: "Hesap bulunamadı." };
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
        nextPrice: minLeaderPrice(mine.price),
        heldSince: mine.heldSince,
        takeovers: mine.takeovers,
        nextRallyAt: mine.lastRallyAt
          ? new Date(Date.parse(mine.lastRallyAt) + RALLY_COOLDOWN_MS).toISOString()
          : null,
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
          xHandle: null,
        },
        price: seeded.price,
        nextPrice: minLeaderPrice(seeded.price),
        heldSince: seeded.heldSince,
        takeovers: seeded.takeovers,
        nextRallyAt: null,
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
      nextRallyAt: null,
    };
  }

  async getSeatMarket(limit = 8): Promise<SeatMarketSummary> {
    // Demo modda dolu koltuklar tohum verisinden ve kullanıcının aldıklarından
    // geliyor; ikisini birleştirip en pahalıları öne alıyoruz.
    const rows: LeaderSeat[] = [];
    const seen = new Set<string>();
    for (const [provinceId, parties] of Object.entries(this.state.mySeats)) {
      for (const partyId of Object.keys(parties)) {
        rows.push(this.seatFor(provinceId, partyId));
        seen.add(`${provinceId}/${partyId}`);
      }
    }
    for (const [provinceId, parties] of Object.entries(this.seed.seats)) {
      for (const partyId of Object.keys(parties)) {
        if (seen.has(`${provinceId}/${partyId}`)) continue;
        if (this.state.releasedSeats[provinceId]?.includes(partyId)) continue;
        rows.push(this.seatFor(provinceId, partyId));
      }
    }
    rows.sort((a, b) => b.price - a.price);
    return {
      held: rows.length,
      volume: rows.reduce((a, r) => a + r.price, 0),
      hot: rows.slice(0, limit),
    };
  }

  /**
   * Canlı oy akışı.
   *
   * Demo modda başka oyuncu yok, ama şerit boş dururken "seçim gecesi" hissi
   * de olmuyor. Kullanıcının kendi oylarının arasına, illerin mevcut oy
   * dağılımına göre ağırlıklandırılmış sahte oylar karıştırılıyor — yani akış
   * haritayla tutarlı: AK Parti'nin önde olduğu ilde daha çok AK Parti oyu
   * geçiyor. Her çağrıda yeniden üretiliyor, bu yüzden şerit gerçekten akıyor.
   */
  async getLiveVotes(limit = 14): Promise<LiveVote[]> {
    const now = Date.now();
    const iller = Object.keys(this.seed.votes).filter(
      (id) => Object.keys(this.seed.votes[id] ?? {}).length > 0,
    );

    const uydurma: LiveVote[] = [];
    for (let i = 0; i < limit && iller.length > 0; i++) {
      const provinceId = iller[Math.floor(Math.random() * iller.length)];
      const row = this.seed.votes[provinceId] ?? {};
      const toplam = Object.values(row).reduce((a, b) => a + b, 0);
      let hedef = Math.random() * toplam;
      let partyId = Object.keys(row)[0];
      for (const [id, n] of Object.entries(row)) {
        hedef -= n;
        if (hedef <= 0) {
          partyId = id;
          break;
        }
      }
      uydurma.push({
        handle: `${pick(Math.random, HANDLE_STEMS)}${Math.floor(Math.random() * 9000 + 1000)}`,
        provinceId,
        partyId,
        // Son 6 dakikaya yayılıyor; şerit hep "az önce" gösteriyor.
        at: new Date(now - Math.floor(Math.random() * 360_000)).toISOString(),
      });
    }

    return [...this.state.recent, ...uydurma]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, limit);
  }

  /**
   * Demo modda gerçek bir geçmiş yok; zaman tüneli örnek akışla besleniyor.
   * Açılış tablosu yine tohumun kendisi, yani video haritanın gerçek
   * başlangıç hâlinden yola çıkıyor.
   */
  async getVoteHistory(): Promise<VoteHistory> {
    return { ...syntheticHistory(), seed: this.seed.votes };
  }

  async getProvinceDetail(provinceId: string): Promise<ProvinceDetail> {
    const standing = this.standingFor(provinceId);
    const seats = PARTY_IDS.map((partyId) => this.seatFor(provinceId, partyId));
    const recentVotes = this.state.recent
      .filter((r) => r.provinceId === provinceId)
      .slice(0, 12)
      .map(({ handle, partyId, at, source }) => ({ handle, partyId, at, source }));
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
      unlimitedVotes: this.state.unlimitedVotes ?? false,
      fastVotesUntil: this.state.fastVotesUntil ?? null,
      linkedProvider: this.state.linkedProvider ?? null,
      fastVotesSince: this.state.fastVotesSince ?? null,
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
        xHandle: null,
      },
      xp: r.xp,
      level: levelFromXp(r.xp),
      voteCount: r.voteCount,
      leaderCount: r.leaderCount,
    }));

    const me = await this.getProfile();
    if (me) {
      rivals.push({
        user: {
          id: me.id,
          handle: me.handle,
          displayName: me.displayName,
          avatarUrl: me.avatarUrl,
          xHandle: me.xHandle,
        },
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
    const kimlik = {
      handle: this.state.user.handle,
      unlimitedVotes: this.state.unlimitedVotes,
      fastVotesUntil: this.state.fastVotesUntil ?? null,
    };
    const unlimited = hasUnlimitedVotes(kimlik);
    const bekleme = voteCooldownMs(kimlik);
    const next = this.state.nextVoteAt ? Date.parse(this.state.nextVoteAt) : 0;
    if (!unlimited && next > now) {
      return { ok: false, message: "Oy hakkın henüz dolmadı." };
    }

    const provinceVotes = (this.state.myVotes[provinceId] ??= {});
    provinceVotes[partyId] = (provinceVotes[partyId] ?? 0) + 1;
    this.state.voteCount += 1;
    this.state.xp += XP_PER_VOTE;
    this.state.nextVoteAt = unlimited ? null : new Date(now + bekleme).toISOString();
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

  async signInWithGoogle() {
    // Demo modda gerçek bir sağlayıcı yok; akışın görünür kısmı çalışsın diye
    // giriş burada taklit ediliyor.
    if (!this.state.user) {
      this.hesapAc(getDeviceIdentity());
    } else {
      this.state.linkedProvider = "google";
      save(this.state);
      this.emit();
    }
    return { ok: true };
  }

  async confirmCheckout(_sessionId: string) {
    // Demo modda Stripe'a gidilmiyor; hak zaten anında veriliyor.
    return { ok: true };
  }

  async startFastVotes(): Promise<FastVotesResult> {
    if (!this.state.user) return { kind: "error", message: "Önce giriş yapmalısın." };
    if (hasFastVotes({ fastVotesUntil: this.state.fastVotesUntil })) {
      return { kind: "error", message: "Hızlı oy aboneliğin zaten sürüyor." };
    }

    // Demo modda ödeme yok: hak anında bir günlüğüne veriliyor.
    const now = Date.now();
    this.state.fastVotesUntil = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    this.state.fastVotesSince ??= new Date(now).toISOString();
    // Elindeki uzun bekleme yeni süreye kısaltılıyor.
    const next = this.state.nextVoteAt ? Date.parse(this.state.nextVoteAt) : 0;
    if (next > now + FAST_VOTE_COOLDOWN_MS) {
      this.state.nextVoteAt = new Date(now + FAST_VOTE_COOLDOWN_MS).toISOString();
    }
    save(this.state);

    const profile = await this.getProfile();
    return { kind: "done", profile: profile! };
  }

  async holdRally(provinceId: string, partyId: string): Promise<RallyResult> {
    if (!this.state.user) return { ok: false, message: "Önce giriş yapmalısın." };

    const seat = this.seatFor(provinceId, partyId);
    if (seat.holder?.id !== this.state.user.id) {
      return { ok: false, message: "Bu ilde o partinin başkanı sen değilsin." };
    }
    if (seat.nextRallyAt && Date.parse(seat.nextRallyAt) > Date.now()) {
      return { ok: false, message: "Bugünkü mitingini yaptın.", nextRallyAt: seat.nextRallyAt };
    }

    const now = Date.now();
    const provinceVotes = (this.state.myVotes[provinceId] ??= {});
    provinceVotes[partyId] = (provinceVotes[partyId] ?? 0) + RALLY_VOTES;

    const owned = this.state.mySeats[provinceId]?.[partyId];
    if (owned) owned.lastRallyAt = new Date(now).toISOString();

    // Akışta miting tek olay olarak görünsün; 100 satır şeridi yutardı.
    this.state.recent.unshift({
      provinceId,
      partyId,
      handle: this.state.user.handle,
      at: new Date(now).toISOString(),
      source: "rally",
    });
    this.state.recent = this.state.recent.slice(0, 80);
    save(this.state);

    return {
      ok: true,
      votes: RALLY_VOTES,
      nextRallyAt: new Date(now + RALLY_COOLDOWN_MS).toISOString(),
      standing: this.standingFor(provinceId),
    };
  }

  async claimSeat(provinceId: string, partyId: string, amount?: number): Promise<CheckoutResult> {
    if (!this.state.user) return { kind: "error", message: "Önce giriş yapmalısın." };
    const seat = this.seatFor(provinceId, partyId);
    if (seat.holder?.id === this.state.user.id) {
      return { kind: "error", message: "Bu koltuk zaten senin." };
    }

    // Tutar ucu açık; alt sınır gerçek modda sunucuda da denetleniyor.
    const bedel = amount ?? seat.nextPrice;
    const kontrol = checkLeaderBid(bedel, seat.nextPrice);
    if (!kontrol.ok) return { kind: "error", message: kontrol.message };

    const now = new Date().toISOString();
    // Tohum sahibinden devralındıysa o kaydı geçersizleştir
    if (seat.holder && seat.holder.id.startsWith("seed:")) {
      const list = (this.state.releasedSeats[provinceId] ??= []);
      if (!list.includes(partyId)) list.push(partyId);
    }
    (this.state.mySeats[provinceId] ??= {})[partyId] = {
      price: bedel,
      heldSince: now,
      takeovers: seat.takeovers + 1,
      xpPaidUntil: now,
      // Miting hakkı koltuğa bağlı: devralan, koltuğun bugünkü hakkı
      // kullanıldıysa yarını bekler.
      lastRallyAt: seat.nextRallyAt
        ? new Date(Date.parse(seat.nextRallyAt) - RALLY_COOLDOWN_MS).toISOString()
        : undefined,
    };
    save(this.state);

    const profile = await this.getProfile();
    return { kind: "done", seat: this.seatFor(provinceId, partyId), profile: profile! };
  }

  /* ---------------- sayaçlar ve özel partiler ---------------- */

  async getStats(): Promise<SiteStats> {
    // Demo modda gerçek sayaç yok; günün saatine göre inandırıcı bir eğri
    // üretiyoruz ki hap boş görünmesin. Gerçek modda bu veriler Supabase'den.
    const now = Date.now();
    const hour = new Date(now).getHours();
    // Akşam saatlerinde yoğunluk artsın
    const daily = 0.55 + 0.45 * Math.sin(((hour - 4) / 24) * Math.PI * 2);
    const jitter = Math.sin(now / 45_000) * 0.06 + Math.sin(now / 11_000) * 0.03;
    const online = Math.max(12, Math.round(430 * daily * (1 + jitter)));
    // Toplam sayaç sürekli ve yavaşça artsın
    const total = 128_400 + Math.floor((now - Date.UTC(2026, 7, 1)) / 42_000);
    return { online, total };
  }

  async getCustomParties(): Promise<Party[]> {
    return this.state.customParties;
  }

  async createParty(input: CustomPartyInput): Promise<CreatePartyResult> {
    if (!this.state.user) return { kind: "error", message: "Önce giriş yapmalısın." };

    const name = input.name.trim();
    const shortName = input.shortName.trim().toLocaleUpperCase("tr");

    if (name.length < 3 || name.length > 40) {
      return { kind: "error", message: "Parti adı 3–40 karakter olmalı." };
    }
    if (shortName.length < PARTY_SHORT_MIN || shortName.length > PARTY_SHORT_MAX) {
      return {
        kind: "error",
        message: `Kısaltma ${PARTY_SHORT_MIN}–${PARTY_SHORT_MAX} harf olmalı.`,
      };
    }
    if (PARTIES.some((p) => p.name.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"))) {
      return { kind: "error", message: "Bu adda bir parti zaten var." };
    }

    const check = checkPartyColor(input.color, takenColors());
    if (!check.ok) {
      return { kind: "error", message: describeColorCheck(check) ?? "Renk uygun değil." };
    }

    const id = `ozel-${shortName.toLocaleLowerCase("tr").replace(/[^a-z0-9]/g, "")}-${Date.now().toString(36)}`;
    const party: Party = {
      id,
      // Pusulada ve listelerde partinin adı görünüyor, rozette kısaltması —
      // hazır partilerde olduğu gibi. Buraya kısaltmayı yazınca kullanıcının
      // kurduğu parti her yerde "DNM" diye görünüyordu.
      name,
      shortName,
      fullName: name,
      color: input.color,
      on: readableTextTone(input.color),
      custom: true,
      logoUrl: input.logoDataUrl,
      ownerHandle: this.state.user.handle,
      blurb: `@${this.state.user.handle} tarafından kuruldu.`,
    };

    this.state.customParties.push(party);
    save(this.state);
    setCustomParties(this.state.customParties);

    return { kind: "done", partyId: id };
  }
}
