/**
 * Oyun kuralları tek yerde. İstemci ve (Supabase kurulumunda) sunucu aynı sabitleri
 * kullanır; sunucu tarafı SQL kopyası `supabase/migrations/20260823120000_init.sql` içinde yorumla işaretlidir.
 */

/** İki oy arasındaki bekleme süresi */
export const VOTE_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Bekleme süresi uygulanmayan kullanıcı adları.
 *
 * Ayrıcalıklı bir liste; oyunun dengesini doğrudan etkiler. Bu yüzden tek
 * yerde duruyor ve gerçek modda SUNUCUDA da denetleniyor (bkz. cast_vote):
 * yalnızca istemcide kalsaydı, isteğini elle atan herkes sınırsız oy
 * kullanabilirdi.
 *
 * Kullanıcı adı değiştirilebildiği için eşleşme küçük harfe indirgenmiş
 * kullanıcı adı üzerinden yapılır.
 */
export const UNLIMITED_VOTE_HANDLES = ["oyuncu47172"] as const;

export function hasUnlimitedVotes(handle: string | null | undefined): boolean {
  if (!handle) return false;
  const normalized = handle.trim().toLocaleLowerCase("tr");
  return UNLIMITED_VOTE_HANDLES.some((h) => h === normalized);
}

/** Oy başına kazanılan XP */
export const XP_PER_VOTE = 1;

/** İl başkanı olarak geçirilen her saat için XP */
export const XP_PER_LEADER_HOUR = 20;

/** Kendi partisini kurmanın haftalık ücreti (USD) */
export const PARTY_WEEKLY_PRICE = 9;

/** Parti kısaltması bu aralıkta olmalı */
export const PARTY_SHORT_MIN = 2;
export const PARTY_SHORT_MAX = 6;

/** Boş bir il başkanlığının açılış fiyatı (USD) */
export const LEADER_BASE_PRICE = 1;

/** Devralma her seferinde bu kadar artar (USD) */
export const LEADER_PRICE_STEP = 1;

/** Bir koltuğu devralmak için ödenmesi gereken tutar */
export function nextLeaderPrice(currentPrice: number | null | undefined): number {
  if (!currentPrice || currentPrice <= 0) return LEADER_BASE_PRICE;
  return currentPrice + LEADER_PRICE_STEP;
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
