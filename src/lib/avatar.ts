/** Kullanıcı adından deterministik, ağ gerektirmeyen bir avatar üretir. */
const PALETTES: Array<[string, string]> = [
  ["#22d3ee", "#3b82f6"],
  ["#f472b6", "#a855f7"],
  ["#fbbf24", "#f97316"],
  ["#34d399", "#059669"],
  ["#f87171", "#dc2626"],
  ["#818cf8", "#4f46e5"],
  ["#2dd4bf", "#0ea5e9"],
  ["#fb7185", "#e11d48"],
];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function fallbackAvatar(handle: string): string {
  const h = hashString(handle || "?");
  const [a, b] = PALETTES[h % PALETTES.length];
  const initials = (handle || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><text x="48" y="60" font-family="Inter,sans-serif" font-size="38" font-weight="700" fill="rgba(9,12,22,0.82)" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
