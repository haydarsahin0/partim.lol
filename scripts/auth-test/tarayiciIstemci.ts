/**
 * Uçtan uca test için sahte Supabase istemcisi (tarayıcı).
 *
 * Google'ın kendi onay ekranı bu ortamda tıklanamıyor. Onun DIŞINDAKİ her şey
 * gerçek: gerçek tarayıcı, gerçek React, gerçek yönlendirme, gerçek arka uç
 * sınıfı. Buradaki taklit yalnızca Supabase'in yerine geçiyor ve OAuth gidiş
 * dönüşünü — adrese `?code=` bırakıp sonraki yüklemede oturumu kurmayı —
 * birebir canlandırıyor.
 *
 * Sunucu durumu localStorage'da: yönlendirme sayfayı baştan yüklüyor, bellekte
 * tutulan şey hayatta kalmazdı.
 */

const SUNUCU = "test/sahte-sunucu";

type Sunucu = {
  /** e-posta özeti → profil */
  kimlikler: Record<string, string>;
  profiller: Record<string, Record<string, unknown>>;
  oturum: { authId: string; email: string } | null;
  sayac: number;
};

function oku(): Sunucu {
  try {
    const ham = localStorage.getItem(SUNUCU);
    if (ham) return JSON.parse(ham) as Sunucu;
  } catch {
    /* yok say */
  }
  return { kimlikler: {}, profiller: {}, oturum: null, sayac: 0 };
}

function yaz(s: Sunucu) {
  localStorage.setItem(SUNUCU, JSON.stringify(s));
}

const dinleyiciler: Array<(e: string, s: unknown) => void> = [];

function oturumNesnesi(s: Sunucu) {
  if (!s.oturum) return null;
  return {
    user: { id: s.oturum.authId, email: s.oturum.email, is_anonymous: false },
    access_token: "sahte",
  };
}

/** Sorgu zinciri: hangi yöntem çağrılırsa çağrılsın boş sonuç döner. */
function zincir(sonuc: unknown) {
  const p: Record<string, unknown> = {};
  const yontemler = [
    "select", "eq", "neq", "in", "order", "limit", "gte", "lte", "not", "is",
    "insert", "upsert", "update", "delete", "filter", "range",
  ];
  for (const y of yontemler) p[y] = () => zincir(sonuc);
  p.maybeSingle = async () => sonuc;
  p.single = async () => sonuc;
  p.then = (ok: (v: unknown) => unknown) => Promise.resolve(sonuc).then(ok);
  return p;
}

export const hasSupabaseConfig = true;
export const supabaseHost = "sahte.test";
export function normalizeSupabaseUrl(u: string) {
  return u;
}

export function getSupabase() {
  const db = {
    auth: {
      getSession: async () => ({ data: { session: oturumNesnesi(oku()) } }),
      getUser: async () => {
        const s = oku();
        return { data: { user: s.oturum ? { id: s.oturum.authId } : null }, error: null };
      },
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        dinleyiciler.push(cb);
        // supabase-js açılışta INITIAL_SESSION yayar.
        setTimeout(() => cb("INITIAL_SESSION", oturumNesnesi(oku())), 0);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      /** Manuel bağlama kapalıymış gibi: kod normal girişe düşsün. */
      linkIdentity: async () => ({
        data: null,
        error: { message: "Manual linking is disabled" },
      }),
      signInWithOAuth: async ({ options }: { options?: { redirectTo?: string } }) => {
        // Google'a gidip dönmüş gibi: dönüş adresine kodu bırak.
        const hedef = options?.redirectTo ?? window.location.origin;
        const eposta =
          new URLSearchParams(window.location.search).get("test_email") ??
          localStorage.getItem("test/eposta") ??
          "oguz@example.com";
        localStorage.setItem("test/bekleyen-kod", eposta);
        window.location.assign(`${hedef}?code=sahte-kod`);
        return { data: { provider: "google", url: hedef }, error: null };
      },
      signInAnonymously: async () => ({ data: null, error: null }),
      signOut: async () => {
        const s = oku();
        s.oturum = null;
        yaz(s);
        return { error: null };
      },
      exchangeCodeForSession: async () => ({ data: null, error: null }),
    },

    rpc: async (ad: string, args?: Record<string, unknown>) => {
      const s = oku();
      if (ad === "ensure_profile") {
        if (!s.oturum) return { data: { ok: false, message: "Oturum yok." }, error: null };

        const ozet = `ozet:${s.oturum.email}`;
        let pid = Object.entries(s.profiller).find(
          ([, p]) => p.auth_user_id === s.oturum!.authId,
        )?.[0];

        // 2) kimlik eşleşmesi — asıl kazanç: başka cihaz, aynı Google hesabı
        if (!pid && s.kimlikler[ozet]) {
          pid = s.kimlikler[ozet];
          s.profiller[pid].auth_user_id = s.oturum.authId;
        }

        // 3) cihaz eşleşmesi (kimliği olmayan eski hesap)
        if (!pid) {
          const cihaz = args?.p_device_id as string;
          const aday = Object.entries(s.profiller).find(
            ([id, p]) => p.device_id === cihaz && !Object.values(s.kimlikler).includes(id),
          );
          if (aday) {
            pid = aday[0];
            s.profiller[pid].auth_user_id = s.oturum.authId;
          }
        }

        // 4) yeni hesap
        if (!pid) {
          s.sayac += 1;
          pid = `p${s.sayac}`;
          s.profiller[pid] = {
            id: pid,
            auth_user_id: s.oturum.authId,
            handle: `oyuncu${1000 + s.sayac}`,
            display_name: `oyuncu${1000 + s.sayac}`,
            avatar_url: null,
            x_handle: null,
            xp: 0,
            vote_count: 0,
            leader_count: 0,
            next_vote_at: null,
            unlimited_votes: false,
            fast_votes_until: null,
            linked_provider: "google",
            device_id: args?.p_device_id ?? null,
            created_at: new Date().toISOString(),
          };
        }

        s.kimlikler[ozet] ??= pid;
        s.profiller[pid].linked_provider = "google";
        yaz(s);
        return { data: { ok: true, profile_id: pid }, error: null };
      }
      return { data: null, error: null };
    },

    from: (tablo: string) => {
      const s = oku();
      if (tablo === "profiles") {
        const p = s.oturum
          ? Object.values(s.profiller).find((x) => x.auth_user_id === s.oturum!.authId)
          : null;
        return zincir({ data: p ?? null, error: null });
      }
      return zincir({ data: [], error: null });
    },

    functions: {
      invoke: async () => ({ data: null, error: null }),
    },
  };

  /*
   * OAuth dönüşü: adreste `?code=` varsa oturumu kur ve olayı yay —
   * supabase-js'in detectSessionInUrl davranışının aynısı.
   */
  const kod = new URLSearchParams(window.location.search).get("code");
  if (kod) {
    const s = oku();
    const eposta = localStorage.getItem("test/bekleyen-kod") ?? "oguz@example.com";
    localStorage.removeItem("test/bekleyen-kod");
    s.sayac += 1;
    // Her giriş yeni bir auth kullanıcısı üretir; profil kimliğe göre bulunur.
    s.oturum = { authId: `auth-${s.sayac}`, email: eposta };
    yaz(s);

    const temiz = new URL(window.location.href);
    temiz.searchParams.delete("code");
    window.history.replaceState({}, "", temiz.toString());

    setTimeout(() => {
      for (const cb of dinleyiciler) cb("SIGNED_IN", oturumNesnesi(oku()));
    }, 30);
  }

  return db as never;
}
