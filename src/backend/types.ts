import type { Party } from "@/data/parties";
import type { DeviceIdentity } from "@/lib/device";

export type AuthUser = {
  id: string;
  /** Oyun içi benzersiz kullanıcı adı (@ olmadan) */
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /**
   * Kullanıcının kendi beyan ettiği X hesabı. DOĞRULANMAMIŞTIR — hesaplar
   * cihazla açıldığı için X sahipliği kanıtlanmıyor. Arayüzde de böyle
   * etiketlenmeli, yoksa taklit kapısı açılır.
   */
  xHandle: string | null;
  /**
   * Oyunun kendi açılış hesabı mı? Büyük illerdeki bazı koltuklar oyun
   * açılırken bu hesaplarla dolduruldu ki devralınacak bir şey olsun.
   * Arayüzde açıkça rozetleniyor — koltuğu parayla devralan biri karşısında
   * gerçek bir oyuncu sanmamalı.
   */
  isBot?: boolean;
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
  /**
   * Bekleme süresinden muaf mı? Sunucuda tutulur ve cast_vote orada da
   * denetler; buradaki değer yalnızca arayüzü doğru göstermek için.
   */
  unlimitedVotes: boolean;
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

/** Ana sayfadaki başkanlık vitrini için tek satır */
export type SeatMarketRow = {
  provinceId: string;
  partyId: string;
  holder: AuthUser | null;
  /** Koltuğun şu anki değeri (boşsa 0) */
  price: number;
  /** Devralmak için ödenecek tutar */
  nextPrice: number;
  heldSince: string | null;
};

export type SeatMarketSummary = {
  /** Ülke genelinde dolu koltuk sayısı */
  held: number;
  /** Bu koltuklara bugüne dek ödenen toplam (USD) */
  volume: number;
  /** En değerli/çekişmeli koltuklar */
  hot: SeatMarketRow[];
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

/** Üstteki hap için canlı sayaçlar */
export type SiteStats = {
  /** Son birkaç dakikada aktif olan kullanıcı */
  online: number;
  /** Açılıştan bu yana toplam ziyaretçi */
  total: number;
};

/** Kullanıcının kurduğu parti */
export type CustomPartyInput = {
  name: string;
  /** 2–6 harf */
  shortName: string;
  /** #RRGGBB */
  color: string;
  /** Yüklenen logo, data URI olarak (isteğe bağlı) */
  logoDataUrl: string | null;
};

export type CreatePartyResult =
  | { kind: "redirect"; url: string }
  | { kind: "done"; partyId: string }
  | { kind: "error"; message: string };

/** Profilde düzenlenebilen alanlar */
export type ProfilePatch = {
  handle?: string;
  displayName?: string;
  xHandle?: string | null;
  avatarUrl?: string | null;
};

export type ProfileUpdateResult =
  | { ok: true; profile: Profile }
  | { ok: false; message: string };

export type BackendMode = "demo" | "supabase";

export interface Backend {
  readonly mode: BackendMode;

  /* --- kimlik --- */
  /**
   * Cihaz kimliğinden oturumu kurar: hesap yoksa açar, varsa devam ettirir.
   * Giriş ekranı yok; uygulama açılışta bunu bir kez çağırır.
   */
  ensureSession(device: DeviceIdentity): Promise<Profile | null>;
  getUser(): Promise<AuthUser | null>;
  /** Oturum değişimlerini dinler, aboneliği iptal eden fonksiyon döner */
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;
  /**
   * Sahip kodunu doğrular ve bu hesaba sınırsız oy hakkı verir. Kod uygulamada
   * değil veritabanında durur (bkz. set_owner_code); pakete gömülseydi kodu
   * okuyan herkes hakkı alırdı.
   */
  claimUnlimited(code: string): Promise<ProfileUpdateResult>;
  /**
   * Ana sayfadaki başkanlık vitrini: en değerli koltuklar ve toplam hacim.
   * Oyunun para kazandıran kısmı bu; ana sayfada görünür olması gerekiyor.
   */
  getSeatMarket(limit?: number): Promise<SeatMarketSummary>;
  /** Profil alanlarını günceller (kullanıcı adı, görünen ad, X hesabı, avatar) */
  updateProfile(patch: ProfilePatch): Promise<ProfileUpdateResult>;
  /** Tarayıcı verisi silinmişse hesabı kurtarma koduyla geri alır */
  restoreAccount(code: string, device: DeviceIdentity): Promise<ProfileUpdateResult>;
  /** Kullanıcıya gösterilecek kurtarma kodu */
  getRecoveryCode(): Promise<string | null>;

  /* --- oyun verisi --- */
  getProfile(): Promise<Profile | null>;
  getStandings(): Promise<Record<string, ProvinceStanding>>;
  getProvinceDetail(provinceId: string): Promise<ProvinceDetail>;
  getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  /** Kullanıcının sahip olduğu koltuklar */
  getMySeats(): Promise<LeaderSeat[]>;
  /** Üstteki hapta gösterilen canlı sayaçlar */
  getStats(): Promise<SiteStats>;
  /** Kullanıcıların kurduğu partiler */
  getCustomParties(): Promise<Party[]>;

  /* --- eylemler --- */
  castVote(provinceId: string, partyId: string): Promise<VoteResult>;
  /** İl başkanlığı için Stripe ödemesini başlatır */
  claimSeat(provinceId: string, partyId: string): Promise<CheckoutResult>;
  /** Haftalık abonelikle yeni bir parti kurar */
  createParty(input: CustomPartyInput): Promise<CreatePartyResult>;
}
