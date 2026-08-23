export type AuthUser = {
  id: string;
  /** @ olmadan Twitter/X kullanıcı adı */
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

export type Profile = AuthUser & {
  xp: number;
  level: number;
  /** Toplam kullanılan oy */
  voteCount: number;
  /** Sahip olunan il başkanlığı sayısı */
  leaderCount: number;
  /** Bir sonraki oyun açılacağı an (ISO). null ise hemen oy kullanılabilir. */
  nextVoteAt: string | null;
  createdAt: string;
};

export type PartyTally = {
  partyId: string;
  votes: number;
  /** 0–100 */
  pct: number;
};

export type ProvinceStanding = {
  provinceId: string;
  totalVotes: number;
  /** Oy sırasına göre, oyu olmayan partiler dâhil değil */
  tallies: PartyTally[];
  leadingPartyId: string | null;
  /** Birinci ile ikinci arasındaki fark (puan) */
  margin: number;
};

export type LeaderSeat = {
  provinceId: string;
  partyId: string;
  /** null ise koltuk boş */
  holder: AuthUser | null;
  /** Koltuğun mevcut değeri (USD). Boşsa 0. */
  price: number;
  /** Devralmak için ödenecek tutar (USD) */
  nextPrice: number;
  /** Koltuğun alındığı an (ISO), boşsa null */
  heldSince: string | null;
  /** Kaç kez el değiştirdi */
  takeovers: number;
};

export type ProvinceDetail = {
  standing: ProvinceStanding;
  seats: LeaderSeat[];
  /** Son oylar (canlı akış hissi için) */
  recentVotes: Array<{ handle: string; partyId: string; at: string }>;
};

export type LeaderboardEntry = {
  user: AuthUser;
  xp: number;
  level: number;
  voteCount: number;
  leaderCount: number;
};

export type VoteResult = {
  ok: boolean;
  /** Hata durumunda kullanıcıya gösterilecek mesaj */
  message?: string;
  profile?: Profile;
  standing?: ProvinceStanding;
};

export type CheckoutResult =
  | { kind: "redirect"; url: string }
  | { kind: "done"; seat: LeaderSeat; profile: Profile }
  | { kind: "error"; message: string };

export type BackendMode = "demo" | "supabase";

export interface Backend {
  readonly mode: BackendMode;

  /* --- kimlik --- */
  getUser(): Promise<AuthUser | null>;
  signInWithTwitter(): Promise<void>;
  signOut(): Promise<void>;
  /** Oturum değişimlerini dinler, aboneliği iptal eden fonksiyon döner */
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;

  /* --- oyun verisi --- */
  getProfile(): Promise<Profile | null>;
  getStandings(): Promise<Record<string, ProvinceStanding>>;
  getProvinceDetail(provinceId: string): Promise<ProvinceDetail>;
  getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  /** Kullanıcının sahip olduğu koltuklar */
  getMySeats(): Promise<LeaderSeat[]>;

  /* --- eylemler --- */
  castVote(provinceId: string, partyId: string): Promise<VoteResult>;
  /** İl başkanlığı için Stripe ödemesini başlatır */
  claimSeat(provinceId: string, partyId: string): Promise<CheckoutResult>;
}
