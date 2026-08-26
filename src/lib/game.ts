/**
 * Oyun kuralları tek yerde. İstemci ve (Supabase kurulumunda) sunucu aynı sabitleri
 * kullanır; sunucu tarafı SQL kopyası `supabase/migrations/20260823120000_init.sql` içinde yorumla işaretlidir.
 */

/**
 * İki oy arasındaki bekleme süresi.
 *
 * Sunucudaki karşılığı cast_vote içinde ayrıca yazılı (bkz. migrations).
 * Burayı değiştirirken oraya da yeni bir migration yazmak gerekir; istemci
 * yalnızca sayacı gösteriyor, kuralı sunucu uyguluyor.
 */
export const VOTE_COOLDOWN_MS = 60 * 1000;

/** Bekleme süresinin insan diliyle karşılığı — arayüz metinlerinde kullanılır. */
export const VOTE_COOLDOWN_LABEL = "1 dakikada 1 oy";

/** Hızlı oy aboneliğindeki bekleme süresi */
export const FAST_VOTE_COOLDOWN_MS = 15 * 1000;

export const FAST_VOTE_COOLDOWN_LABEL = "15 saniyede 1 oy";

/**
 * Kısa süre etiketi ("1 dk", "15 sn").
 *
 * Değerden türetiliyor: arayüzde elle yazılan "15 sn" gibi metinler, bekleme
 * süresi değiştiği gün sessizce yalan söylemeye başlıyordu.
 */
export function shortDuration(ms: number): string {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} dk`;
  return `${Math.round(ms / 1000)} sn`;
}

/** Hızlı oy normalin kaç katı? Rozetteki "4×" bundan geliyor. */
export const FAST_VOTE_MULTIPLIER = Math.round(VOTE_COOLDOWN_MS / FAST_VOTE_COOLDOWN_MS);

/**
 * Hızlı oy aboneliğinin günlük ücreti (USD).
 *
 * Arayüzde bilerek yazmıyor: düğmede yalnızca ne kazandırdığı duruyor, ücreti
 * kullanıcı Stripe sayfasında görüyor. Buradaki değer sunucu tarafındaki
 * create-fast-votes-subscription ile aynı olmalı; ödeme oradan geçiyor.
 */
export const FAST_VOTE_DAILY_PRICE = 3;

/** Hızlı oy aboneliği şu an geçerli mi? */
export function hasFastVotes(
  profile: { fastVotesUntil?: string | null } | null | undefined,
): boolean {
  const until = profile?.fastVotesUntil;
  return !!until && Date.parse(until) > Date.now();
}

/** Bu profil için geçerli bekleme süresi. Sunucudaki cast_vote ile aynı kural. */
export function voteCooldownMs(
  profile:
    | { handle?: string | null; unlimitedVotes?: boolean; fastVotesUntil?: string | null }
    | null
    | undefined,
): number {
  if (hasUnlimitedVotes(profile)) return 0;
  return hasFastVotes(profile) ? FAST_VOTE_COOLDOWN_MS : VOTE_COOLDOWN_MS;
}

/**
 * Bekleme süresi uygulanmayan kullanıcı adları.
 *
 * Eski yöntem; kullanıcı adı değiştirilebildiği için hak kaybolabiliyordu.
 * Artık asıl kaynak profilin kendisi (`unlimitedVotes`), bu liste yalnızca
 * geriye dönük uyumluluk için duruyor. İkisi de gerçek modda SUNUCUDA
 * denetlenir (bkz. cast_vote): yalnızca istemcide kalsaydı, isteğini elle
 * atan herkes sınırsız oy kullanabilirdi.
 */
export const UNLIMITED_VOTE_HANDLES = ["oyuncu47172"] as const;

/** Sınırsız oy hakkı taşıyan bir profil mi? */
export function hasUnlimitedVotes(
  profile: { handle?: string | null; unlimitedVotes?: boolean } | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.unlimitedVotes) return true;
  const handle = profile.handle;
  if (!handle) return false;
  const normalized = handle.trim().toLocaleLowerCase("tr");
  return UNLIMITED_VOTE_HANDLES.some((h) => h === normalized);
}

/**
 * Sıralamada görünmek için gereken en az oy.
 *
 * Toplu açılmış hesaplar sıralamayı dolduruyordu ("imamoglu1, imamoglu2…").
 * Eşik bilerek düşük: gerçekten oynayan biri ilk birkaç dakikada geçiyor ve
 * farkına bile varmıyor; onlarca hesabı tek tek bu eşiğin üstüne çıkarmak ise
 * işi bedava olmaktan çıkarıyor. Kural asıl olarak sunucudaki `leaderboard`
 * görünümünde; buradaki değer yalnızca doğru metni göstermek için.
 */
export const LEADERBOARD_MIN_VOTES = 10;

/** Bu profil sıralamada görünür mü? */
export function isLeaderboardVisible(
  profile: { voteCount?: number; leaderCount?: number } | null | undefined,
): boolean {
  if (!profile) return false;
  return (profile.voteCount ?? 0) >= LEADERBOARD_MIN_VOTES || (profile.leaderCount ?? 0) > 0;
}

/** Oy başına kazanılan XP */
export const XP_PER_VOTE = 1;

/** İl başkanı olarak geçirilen her saat için XP */
export const XP_PER_LEADER_HOUR = 20;

/**
 * Bir mitingin partiye o ilde eklediği oy.
 *
 * Miting, il başkanlığını haritanın koluna çeviren şey: koltuk parayla
 * alınıyordu ama oyunun sonucuna hiç dokunmuyordu. Sayı buradan tek yerden
 * ayarlanıyor — dengeyi değiştirmek isteyen tek satır düzeltir.
 */
export const RALLY_VOTES = 60;

/** İki miting arasında beklenecek süre */
export const RALLY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const RALLY_COOLDOWN_LABEL = "günde 1 miting";

/** Kendi partisini kurmanın haftalık ücreti (USD) */
export const PARTY_WEEKLY_PRICE = 19;

/** Parti kısaltması bu aralıkta olmalı */
export const PARTY_SHORT_MIN = 2;
export const PARTY_SHORT_MAX = 6;

/** Boş bir il başkanlığının açılış fiyatı (USD) */
export const LEADER_BASE_PRICE = 1;

/** Devralmak için en az bu kadar artırmak gerekir (USD) */
export const LEADER_PRICE_STEP = 1;

/**
 * Koltuk fiyatının tavanı (USD).
 *
 * Ucu açık olması istendi, ama tamamen sınırsız bırakmak tehlikeli: yanlışlıkla
 * fazladan sıfır yazan biri kart limitine takılana kadar bunu fark etmiyor ve
 * iadesi elle yapılıyor. Tavan hem kazayı hem Stripe'ın kendi üst sınırına
 * çarpmayı önlüyor.
 */
export const LEADER_MAX_PRICE = 100_000;

/**
 * Bir koltuğu devralmak için ödenmesi gereken EN AZ tutar.
 *
 * Fiyat artık sabit merdiven değil: kullanıcı bu tutarın üstünde istediğini
 * ödeyebiliyor. Ödediği tutar koltuğun yeni değeri oluyor, yani sonraki
 * devralma da oradan devam ediyor.
 */
export function minLeaderPrice(currentPrice: number | null | undefined): number {
  if (!currentPrice || currentPrice <= 0) return LEADER_BASE_PRICE;
  return currentPrice + LEADER_PRICE_STEP;
}

/** Girilen teklif geçerli mi? Hata varsa sebebini döner. */
export function checkLeaderBid(
  amount: number,
  minimum: number,
): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(amount)) return { ok: false, message: "Geçerli bir tutar gir." };
  // Stripe kuruş cinsinden çalışıyor; iki basamaktan fazlası sessizce yuvarlanır.
  if (Math.round(amount * 100) !== amount * 100) {
    return { ok: false, message: "Tutar en fazla iki ondalık basamak olabilir." };
  }
  if (amount < minimum) {
    return { ok: false, message: `En az ${formatUsd(minimum)} ödemelisin.` };
  }
  if (amount > LEADER_MAX_PRICE) {
    return { ok: false, message: `En fazla ${formatUsd(LEADER_MAX_PRICE)} ödeyebilirsin.` };
  }
  return { ok: true };
}

/**
 * Seviye eğrisi: L seviyesine ulaşmak için gereken toplam XP = 25 * (L-1) * L
 * 1→2: 50, 2→3: 100, 3→4: 150 ... yani her seviye 50 XP daha pahalı.
 */
export function totalXpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 25 * (l - 1) * l;
}

export function levelFromXp(xp: number): number {
  const safe = Math.max(0, xp);
  // 25L² - 25L - xp = 0  =>  L = (25 + sqrt(625 + 100*xp)) / 50
  return Math.max(1, Math.floor((25 + Math.sqrt(625 + 100 * safe)) / 50));
}

export type LevelProgress = {
  level: number;
  /** Bu seviyede biriken XP */
  current: number;
  /** Bir sonraki seviye için gereken XP */
  needed: number;
  /** 0–1 arası ilerleme */
  ratio: number;
  title: string;
};

const TITLES: Array<{ min: number; title: string }> = [
  { min: 1, title: "Sandık Görevlisi" },
  { min: 3, title: "Mahalle Temsilcisi" },
  { min: 6, title: "İlçe Yöneticisi" },
  { min: 10, title: "İl Yöneticisi" },
  { min: 15, title: "Bölge Koordinatörü" },
  { min: 21, title: "Genel Merkez Kurmayı" },
  { min: 28, title: "Genel Başkan Yardımcısı" },
  { min: 36, title: "Genel Başkan" },
  { min: 50, title: "Efsane Lider" },
];

export function levelTitle(level: number): string {
  let title = TITLES[0].title;
  for (const t of TITLES) if (level >= t.min) title = t.title;
  return title;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const floor = totalXpForLevel(level);
  const ceil = totalXpForLevel(level + 1);
  const current = xp - floor;
  const needed = ceil - floor;
  return {
    level,
    current,
    needed,
    ratio: needed > 0 ? Math.min(1, current / needed) : 1,
    title: levelTitle(level),
  };
}

/** Bir sonraki oy hakkına kalan süre (ms). 0 ise oy kullanılabilir. */
export function cooldownRemaining(nextVoteAt: string | null | undefined, now = Date.now()): number {
  if (!nextVoteAt) return 0;
  const t = Date.parse(nextVoteAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, t - now);
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "00:00";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const trNumber = new Intl.NumberFormat("tr-TR");
export const formatNumber = (n: number) => trNumber.format(Math.round(n));

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
export const formatUsd = (n: number) => usd.format(n);

export function formatPercent(value: number, digits = 1): string {
  return `%${value.toFixed(digits).replace(".", ",")}`;
}

/** "3 saattir" gibi kısa görece süre */
export function formatSince(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 60) return `${mins} dk`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa`;
  return `${Math.floor(hours / 24)} gün`;
}
