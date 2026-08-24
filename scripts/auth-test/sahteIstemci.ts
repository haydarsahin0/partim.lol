/** Testte gerçek Supabase yerine geçen sahte istemci. */
export const durum = {
  cagrilar: [] as string[],
  authCallback: null as null | ((e: string, s: unknown) => void),
  profilVar: false,
  oturumVar: false,
};

const sahteDb = {
  auth: {
    getSession: async () => ({
      data: { session: durum.oturumVar ? { user: { id: "auth-1" } } : null },
    }),
    onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
      durum.authCallback = cb;
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  },
  rpc: async (ad: string) => {
    durum.cagrilar.push(`rpc:${ad}`);
    if (ad === "ensure_profile") {
      durum.profilVar = true;
      return { data: { ok: true, profile_id: "p1" }, error: null };
    }
    return { data: null, error: null };
  },
  from: (tablo: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          durum.cagrilar.push(`select:${tablo}`);
          return durum.profilVar
            ? {
                data: {
                  id: "p1", handle: "oguz", display_name: "Oguz", avatar_url: null,
                  x_handle: null, xp: 0, vote_count: 0, leader_count: 0,
                  next_vote_at: null, unlimited_votes: false, fast_votes_until: null,
                  linked_provider: "google", created_at: new Date().toISOString(),
                },
                error: null,
              }
            : { data: null, error: null };
        },
      }),
    }),
  }),
};

export function getSupabase() {
  return sahteDb as never;
}
export const hasSupabaseConfig = true;
export const supabaseHost = "test";
export function normalizeSupabaseUrl(u: string) { return u; }
