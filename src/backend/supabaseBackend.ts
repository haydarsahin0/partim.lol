/**
 * Gerçek arka uç: Supabase (Twitter/X OAuth + Postgres) ve Stripe Checkout.
 *
 * Şema ve sunucu tarafı kurallar `supabase/migrations/20260823120000_init.sql` içindedir; oy soğuma süresi,
 * XP ve koltuk fiyatı orada da doğrulanır — istemciye güvenilmez.
 */
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { PARTY_IDS, readableTextTone, type Party } from "@/data/parties";
import { fallbackAvatar } from "@/lib/avatar";
import {
  LEADER_BASE_PRICE,
  RALLY_COOLDOWN_MS,
  RALLY_VOTES,
  formatUsd,
  levelFromXp,
  minLeaderPrice,
} from "@/lib/game";
import { getSupabase } from "./supabaseClient";
import { getDeviceIdentity, normalizeRecoveryCode, type DeviceIdentity } from "@/lib/device";
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
  ProvinceStanding,
  VoteHistory,
  VoteHistoryBucket,
  FastVotesResult,
  RallyResult,
  SeatMarketSummary,
  VoteResult,
} from "./types";

type TallyRow = { province_id: string; party_id: string; votes: number };
type SeatRow = {
  province_id: string;
  party_id: string;
  price: number | string;
  held_since: string | null;
  takeovers: number;
  last_rally_at?: string | null;
  holder: {
    id: string;
    handle: string;
    display_name: string;
    avatar_url: string | null;
    x_handle?: string | null;
    is_bot?: boolean | null;
  } | null;
};
type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  x_handle?: string | null;
  xp: number;
  vote_count: number;
  leader_count: number;
  next_vote_at: string | null;
  unlimited_votes?: boolean | null;
  fast_votes_until?: string | null;
  fast_votes_since?: string | null;
  /** Göç uygulanmamış sunucularda hiç gelmiyor; bkz. profilAlanlari(). */
  fast_votes_cancel_at?: string | null;
  linked_provider?: string | null;
  is_bot?: boolean | null;
  created_at: string;
};

/** profiles satırından oyun içi kimliğe */
function authUserFromProfileRow(row: ProfileRow): AuthUser {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name || row.handle,
    avatarUrl: row.avatar_url ?? fallbackAvatar(row.handle),
    xHandle: row.x_handle ?? null,
    isBot: row.is_bot ?? false,
  };
}

function authUserFromRow(row: SeatRow["holder"]): AuthUser | null {
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name || row.handle,
    avatarUrl: row.avatar_url ?? fallbackAvatar(row.handle),
    xHandle: row.x_handle ?? null,
    isBot: row.is_bot ?? false,
  };
}

function seatFromRow(row: SeatRow): LeaderSeat {
  const price = Number(row.price ?? 0);
  return {
    provinceId: row.province_id,
    partyId: row.party_id,
    holder: authUserFromRow(row.holder),
    price,
    nextPrice: minLeaderPrice(price),
    heldSince: row.held_since,
    takeovers: row.takeovers ?? 0,
    nextRallyAt: row.last_rally_at
      ? new Date(Date.parse(row.last_rally_at) + RALLY_COOLDOWN_MS).toISOString()
      : null,
  };
}

function emptySeat(provinceId: string, partyId: string): LeaderSeat {
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

function standingFromRows(provinceId: string, rows: TallyRow[]): ProvinceStanding {
  const total = rows.reduce((a, r) => a + r.votes, 0);
  const tallies = rows
    .filter((r) => r.votes > 0)
    .map((r) => ({ partyId: r.party_id, votes: r.votes, pct: total ? (r.votes / total) * 100 : 0 }))
    .sort((a, b) => b.votes - a.votes);
  return {
    provinceId,
    totalVotes: total,
    tallies,
    leadingPartyId: tallies[0]?.partyId ?? null,
    margin: tallies.length > 1 ? tallies[0].pct - tallies[1].pct : tallies.length === 1 ? 100 : 0,
  };
}

/**
 * Edge fonksiyonu çağırır ve HATAYI OKUNUR HÂLE GETİRİR.
 *
 * supabase-js, 2xx dışında dönen her yanıt için sabit "Edge Function returned
 * a non-2xx status code" mesajı üretir; fonksiyonun gövdesinde yazdığımız
 * gerçek sebep (`{"error": "..."}`) kullanıcıya hiç ulaşmaz. Bunu okumak için
 * hatanın taşıdığı Response'u açıyoruz.
 *
 * Fonksiyon hiç yüklenmemişse (404) da aynı sabit mesaj geliyor; o durumda ne
 * yapılacağını söyleyen bir metin dönüyoruz — bu, "parti kur ödemeye
 * yönlendirmiyor" hatasının tam olarak sebebiydi.
 */
/**
 * Bir sorgunun BÜTÜN satırlarını getirir.
 *
 * NEDEN
 *
 * PostgREST tek istekte dönen satır sayısını sınırlayabiliyor (db-max-rows).
 * Zaman tünelinin iki kaynağı da sınırsız büyüyor: açılış tablosu 81 il × parti,
 * oy geçmişi ise kova × il × parti. Sınıra takılırsa yanıt SESSİZCE kırpılıyor —
 * hata yok, eksik veri var. Videodaki il oranları da bu yüzden gerçeğiyle
 * tutmuyordu: kırpılan illerin oyları hiç gelmiyordu.
 *
 * Sayfalayarak okumak bu riski tümüyle ortadan kaldırıyor; sunucunun sınırı ne
 * olursa olsun son sayfaya kadar gidiyoruz.
 */
const SAYFA = 1000;

async function tumSatirlar<T>(
  sorguKur: (bas: number, son: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const hepsi: T[] = [];
  for (let bas = 0; ; bas += SAYFA) {
    const { data, error } = await sorguKur(bas, bas + SAYFA - 1);
    if (error) throw error;
    const parca = (data ?? []) as T[];
    hepsi.push(...parca);
    // Sayfa dolmadıysa son sayfadayız.
    if (parca.length < SAYFA) return hepsi;
  }
}

/*
 * Profil satırında okunan sütunlar.
 *
 * fast_votes_cancel_at AYRI DURUYOR çünkü sonradan eklendi. Uygulama ile
 * veritabanı farklı zamanlarda yayına çıkabiliyor: göç henüz uygulanmamışken
 * bu sütunu istemek PostgREST'te tüm sorguyu düşürür ve kullanıcı profilini
 * hiç göremez — yani küçük bir arayüz ayrıntısı için oyun açılmaz olur.
 * Bir kez denenip düşülüyor ve sonuç hatırlanıyor.
 */
const PROFIL_TEMEL =
  "id,handle,display_name,avatar_url,x_handle,xp,vote_count,leader_count,next_vote_at," +
  "unlimited_votes,fast_votes_until,fast_votes_since,linked_provider,created_at";
const PROFIL_YENI = `${PROFIL_TEMEL},fast_votes_cancel_at`;

let iptalSutunuVar = true;
function profilAlanlari(): string {
  return iptalSutunuVar ? PROFIL_YENI : PROFIL_TEMEL;
}

/** Hata "böyle bir sütun yok" mu? (göç uygulanmamış) */
function sutunYok(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 42703 = undefined_column. PostgREST bunu PGRST204 ile de bildirebiliyor.
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /fast_votes_cancel_at/.test(error.message ?? "")
  );
}

async function invokeEdge<T>(
  db: SupabaseClient,
  name: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; message?: string }> {
  const { data, error } = await db.functions.invoke(name, { body });
  if (!error) return { data: data as T };

  const context = (error as { context?: Response }).context;
  if (context && typeof context.status === "number") {
    if (context.status === 404) {
      return {
        data: null,
        message: `Ödeme servisi (${name}) sunucuya yüklenmemiş. GitHub → Actions → "Supabase'e uygula" → hedef: fonksiyonlar.`,
      };
    }
    try {
      const text = await context.text();
      const parsed = text ? (JSON.parse(text) as { error?: string }) : null;
      if (parsed?.error) return { data: null, message: parsed.error };
      if (text) return { data: null, message: text.slice(0, 300) };
    } catch {
      /* gövde okunamadı; aşağıdaki genel mesaja düş */
    }
  }
  return { data: null, message: error.message };
}

export class SupabaseBackend implements Backend {
  readonly mode = "supabase" as const;

  private get db() {
    return getSupabase();
  }

  /* ---------------- kimlik ---------------- */

  /** Son okunan profil; her istekte tabloya gitmemek için. */
  private cachedProfile: Profile | null = null;

  /**
   * Giriş ekranı yok. Supabase'in anonim oturumu açılır — JWT tarayıcıda kalır,
   * kullanıcı geri geldiğinde aynı hesaba düşer — sonra ensure_profile ile
   * profil oluşturulur veya bulunur.
   */
  async ensureSession(device: DeviceIdentity): Promise<Profile | null> {
    /*
     * Hesap ARTIK KENDİLİĞİNDEN AÇILMIYOR.
     *
     * Önce oturumu olmayan herkese anonim bir hesap açılıp rastgele bir
     * kullanıcı adı veriliyordu ("oyuncu41273"). Bu hesap yalnızca tarayıcıya
     * bağlıydı: veri silinince ya da başka cihaza geçilince oyunla birlikte
     * satın alımlar da gidiyordu. Artık kayıt Google üzerinden yürüyor.
     *
     * Oturumu olmayan ziyaretçi haritayı, sıralamayı ve sonuçları görmeye
     * devam ediyor; giriş yalnızca bir şey YAPMAYA kalkınca isteniyor.
     * Eskiden açılmış anonim oturumlar geçerliliğini koruyor — kimse
     * hesabından edilmiyor.
     */
    const { data: sessionData } = await this.db.auth.getSession();
    if (!sessionData.session) return null;

    const { data, error } = await this.db.rpc("ensure_profile", {
      p_device_id: device.deviceId,
      p_device_hash: device.deviceHash,
    });
    if (error) throw error;
    const res = data as { ok: boolean; message?: string } | null;
    if (!res?.ok) throw new Error(res?.message ?? "Hesap açılamadı.");

    this.cachedProfile = null;
    return this.getProfile();
  }

  async getUser(): Promise<AuthUser | null> {
    const profile = this.cachedProfile ?? (await this.getProfile());
    if (!profile) return null;
    return {
      id: profile.id,
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      xHandle: profile.xHandle,
    };
  }

  onAuthChange(cb: (user: AuthUser | null) => void): () => void {
    const { data } = this.db.auth.onAuthStateChange(
      async (_event: string, session: Session | null) => {
        this.cachedProfile = null;
        if (!session) {
          cb(null);
          return;
        }

        /*
         * BURADA PROFİL AÇILMALI.
         *
         * Eskiden yalnızca getUser() çağrılıyordu; o da profil satırını OKUYAN
         * bir sorgu. Google ile ilk kez giren kullanıcının henüz profil satırı
         * olmadığı için null dönüyor ve hiçbir şey onu oluşturmuyordu:
         * kullanıcı Google'da hesabını seçiyor, siteye dönüyor ve sanki hiçbir
         * şey olmamış gibi çıkışlı kalıyordu.
         *
         * Açılışta ensureSession çalışıyor ama o sırada oturum henüz yok;
         * oturum tam da bu olayla geliyor. O yüzden profili burada kuruyoruz.
         */
        try {
          const profile = await this.ensureSession(getDeviceIdentity());
          cb(
            profile
              ? {
                  id: profile.id,
                  handle: profile.handle,
                  displayName: profile.displayName,
                  avatarUrl: profile.avatarUrl,
                  xHandle: profile.xHandle,
                }
              : null,
          );
        } catch {
          // Profil kurulamadıysa en azından oturumu yansıt; kullanıcı yeniden
          // deneyebilsin diye sessiz kalmıyoruz, çağıran hatayı gösteriyor.
          cb(await this.getUser());
        }
      },
    );
    return () => data.subscription.unsubscribe();
  }

  async updateProfile(patch: ProfilePatch): Promise<ProfileUpdateResult> {
    const { data, error } = await this.db.rpc("update_profile", {
      p_handle: patch.handle ?? null,
      p_display_name: patch.displayName ?? null,
      // "dokunma" ile "temizle" farklı: null = değiştirme, boş dize = sil.
      p_x_handle: patch.xHandle === undefined ? null : (patch.xHandle ?? ""),
      p_avatar_url: patch.avatarUrl === undefined ? null : (patch.avatarUrl ?? ""),
    });
    if (error) return { ok: false, message: error.message };
    const res = data as { ok: boolean; message?: string } | null;
    if (!res?.ok) return { ok: false, message: res?.message ?? "Profil güncellenemedi." };

    this.cachedProfile = null;
    const profile = await this.getProfile();
    return profile ? { ok: true, profile } : { ok: false, message: "Profil okunamadı." };
  }

  async checkHandle(handle: string) {
    const { data, error } = await this.db.rpc("handle_available", { p_handle: handle });
    /*
     * Sunucuya ulaşılamadıysa (ağ hatası ya da fonksiyon henüz yüklenmemiş)
     * bu bir RET DEĞİL. Önceden hata mesajı "alınmış" gibi gösteriliyor ve
     * Kaydet kapalı kalıyordu; fonksiyon yüklenene kadar kimse kullanıcı adını
     * değiştiremiyordu. Karar yine sunucuda: update_profile aynı kuralı
     * uyguluyor ve benzersiz dizin arkada tutuyor.
     */
    if (error) return { ok: true, kontrolEdilemedi: true, message: error.message };
    const res = data as { ok: boolean; message?: string } | null;
    if (!res) return { ok: true, kontrolEdilemedi: true };
    return { ok: !!res.ok, message: res.message };
  }

  async claimUnlimited(code: string): Promise<ProfileUpdateResult> {
    const { data, error } = await this.db.rpc("claim_unlimited", { p_code: code.trim() });
    if (error) return { ok: false, message: error.message };
    const res = data as { ok: boolean; message?: string } | null;
    if (!res?.ok) return { ok: false, message: res?.message ?? "Kod doğrulanamadı." };

    this.cachedProfile = null;
    const profile = await this.getProfile();
    return profile ? { ok: true, profile } : { ok: false, message: "Profil okunamadı." };
  }

  async getRecoveryCode(): Promise<string | null> {
    const { data, error } = await this.db.rpc("get_recovery_code");
    if (error) return null;
    return (data as string | null) ?? null;
  }

  async restoreAccount(code: string, device: DeviceIdentity): Promise<ProfileUpdateResult> {
    const { data: sessionData } = await this.db.auth.getSession();
    if (!sessionData.session) {
      const { error } = await this.db.auth.signInAnonymously();
      if (error) return { ok: false, message: error.message };
    }
    const { data, error } = await this.db.rpc("restore_account", {
      p_code: normalizeRecoveryCode(code),
      p_device_id: device.deviceId,
    });
    if (error) return { ok: false, message: error.message };
    const res = data as { ok: boolean; message?: string } | null;
    if (!res?.ok) return { ok: false, message: res?.message ?? "Hesap geri alınamadı." };

    this.cachedProfile = null;
    const profile = await this.getProfile();
    return profile ? { ok: true, profile } : { ok: false, message: "Profil okunamadı." };
  }

  /* ---------------- okuma ---------------- */

  async getProfile(): Promise<Profile | null> {
    const { data: sessionData } = await this.db.auth.getSession();
    if (!sessionData.session) return null;

    const oku = () =>
      this.db
        .from("profiles")
        .select(profilAlanlari())
        .eq("auth_user_id", sessionData.session!.user.id)
        .maybeSingle();

    let { data, error } = await oku();
    if (error && iptalSutunuVar && sutunYok(error)) {
      // Göç henüz uygulanmamış: sütunsuz devam et, bir daha deneme.
      iptalSutunuVar = false;
      ({ data, error } = await oku());
    }
    if (error) throw error;

    const row = data as ProfileRow | null;
    if (!row) return null;

    this.cachedProfile = {
      ...authUserFromProfileRow(row),
      xp: row.xp,
      level: levelFromXp(row.xp),
      voteCount: row.vote_count,
      leaderCount: row.leader_count ?? 0,
      nextVoteAt: row.next_vote_at,
      unlimitedVotes: row.unlimited_votes ?? false,
      fastVotesUntil: row.fast_votes_until ?? null,
      linkedProvider: row.linked_provider ?? null,
      fastVotesSince: row.fast_votes_since ?? null,
      fastVotesCancelAt: row.fast_votes_cancel_at ?? null,
      createdAt: row.created_at,
    };
    return this.cachedProfile;
  }

  async getStandings(): Promise<Record<string, ProvinceStanding>> {
    const { data, error } = await this.db
      .from("province_tallies")
      .select("province_id,party_id,votes");
    if (error) throw error;
    const grouped = new Map<string, TallyRow[]>();
    for (const row of (data ?? []) as TallyRow[]) {
      const list = grouped.get(row.province_id) ?? [];
      list.push(row);
      grouped.set(row.province_id, list);
    }
    const out: Record<string, ProvinceStanding> = {};
    for (const [provinceId, rows] of grouped) out[provinceId] = standingFromRows(provinceId, rows);
    return out;
  }

  async getProvinceDetail(provinceId: string): Promise<ProvinceDetail> {
    const [talliesRes, seatsRes, recentRes] = await Promise.all([
      this.db.from("province_tallies").select("province_id,party_id,votes").eq("province_id", provinceId),
      this.db
        .from("leader_seats")
        .select("province_id,party_id,price,held_since,takeovers,last_rally_at,holder:profiles(id,handle,display_name,avatar_url,x_handle,is_bot)")
        .eq("province_id", provinceId),
      this.db
        .from("recent_votes")
        .select("handle,party_id,created_at,source")
        .eq("province_id", provinceId)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
    if (talliesRes.error) throw talliesRes.error;
    if (seatsRes.error) throw seatsRes.error;

    const byParty = new Map<string, LeaderSeat>();
    for (const row of (seatsRes.data ?? []) as unknown as SeatRow[]) {
      byParty.set(row.party_id, seatFromRow(row));
    }
    return {
      standing: standingFromRows(provinceId, (talliesRes.data ?? []) as TallyRow[]),
      seats: PARTY_IDS.map((partyId) => byParty.get(partyId) ?? emptySeat(provinceId, partyId)),
      recentVotes: ((recentRes.data ?? []) as Array<{
        handle: string;
        party_id: string;
        created_at: string;
        source?: string;
      }>).map((r) => ({
        handle: r.handle,
        partyId: r.party_id,
        at: r.created_at,
        source: r.source === "rally" ? ("rally" as const) : ("vote" as const),
      })),
    };
  }

  async getMySeats(): Promise<LeaderSeat[]> {
    const user = this.cachedProfile ?? (await this.getProfile());
    if (!user) return [];
    const { data, error } = await this.db
      .from("leader_seats")
      .select("province_id,party_id,price,held_since,takeovers,last_rally_at,holder:profiles(id,handle,display_name,avatar_url,x_handle,is_bot)")
      .eq("user_id", user.id)
      .order("held_since", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as SeatRow[]).map(seatFromRow);
  }

  async getSeatMarket(limit = 8): Promise<SeatMarketSummary> {
    const [hotRes, allRes] = await Promise.all([
      this.db
        .from("leader_seats")
        .select(
          "province_id,party_id,price,held_since,takeovers,last_rally_at,holder:profiles(id,handle,display_name,avatar_url,x_handle,is_bot)",
        )
        .order("price", { ascending: false })
        .limit(limit),
      // Hacim ve dolu koltuk sayısı için yalnızca fiyat sütunu yeterli.
      this.db.from("leader_seats").select("price"),
    ]);
    if (hotRes.error) throw hotRes.error;

    const prices = ((allRes.data ?? []) as Array<{ price: number | string }>).map((r) =>
      Number(r.price ?? 0),
    );
    return {
      held: prices.length,
      volume: prices.reduce((a, b) => a + b, 0),
      hot: ((hotRes.data ?? []) as unknown as SeatRow[]).map(seatFromRow),
    };
  }

  async getLiveVotes(limit = 14): Promise<LiveVote[]> {
    const { data, error } = await this.db
      .from("recent_votes")
      .select("handle,province_id,party_id,created_at,source")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return ((data ?? []) as Array<{
      handle: string;
      province_id: string;
      party_id: string;
      created_at: string;
      source?: string;
    }>).map((row) => ({
      handle: row.handle,
      provinceId: row.province_id,
      partyId: row.party_id,
      at: row.created_at,
      source: row.source === "rally" ? ("rally" as const) : ("vote" as const),
    }));
  }

  async getVoteHistory(bucket: VoteHistoryBucket = "hour"): Promise<VoteHistory> {
    // İkisi de sayfalanarak okunuyor: kırpılan tek satır bile videodaki il
    // oranlarını gerçeğinden kaydırıyor (bkz. tumSatirlar).
    const [seedRows, historyRows] = await Promise.all([
      // Sayfalama ancak sıralama kesinse doğru: sıra belirsizse sayfa
      // sınırındaki satırlar ya iki kez gelir ya hiç gelmez.
      tumSatirlar<{ province_id: string; party_id: string; votes: number }>((bas, son) =>
        this.db
          .from("seed_snapshot")
          .select("province_id,party_id,votes")
          .order("province_id")
          .order("party_id")
          .range(bas, son),
      ),
      tumSatirlar<{ bucket: string; province_id: string; party_id: string; votes: number }>(
        (bas, son) =>
          this.db.rpc("vote_history", { p_bucket: bucket, p_since: null }).range(bas, son),
      ),
    ]);

    const seed: VoteHistory["seed"] = {};
    for (const row of seedRows) {
      (seed[row.province_id] ??= {})[row.party_id] = row.votes;
    }

    const byBucket = new Map<string, VoteHistory["seed"]>();
    for (const row of historyRows) {
      const at = new Date(row.bucket).toISOString();
      const delta = byBucket.get(at) ?? {};
      (delta[row.province_id] ??= {})[row.party_id] = row.votes;
      byBucket.set(at, delta);
    }

    return {
      seed,
      buckets: [...byBucket.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([at, delta]) => ({ at, delta })),
    };
  }

  async getLeaderboard(limit = 25): Promise<LeaderboardEntry[]> {
    /*
     * Sıralama `leaderboard` görünümünden okunuyor, tablodan değil.
     *
     * Görünüm iki kuralı birden uyguluyor: oyunun kendi hesapları listede yer
     * almıyor ve bir hesap ancak eşiği geçtikten sonra görünüyor (10 oy ya da
     * bir il başkanlığı). Kural görünümde durduğu için istemci onu atlayamıyor
     * — toplu açılmış hesaplar sıralamayı dolduramıyor.
     */
    const { data, error } = await this.db
      .from("leaderboard")
      .select("id,handle,display_name,avatar_url,x_handle,is_bot,xp,vote_count,leader_count")
      .order("xp", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as ProfileRow[]).map((row) => ({
      user: authUserFromProfileRow(row),
      xp: row.xp,
      level: levelFromXp(row.xp),
      voteCount: row.vote_count,
      leaderCount: row.leader_count ?? 0,
    }));
  }

  async getChairmen(limit = 50): Promise<LeaderboardEntry[]> {
    /*
     * Aynı `leaderboard` görünümü: oyunun kendi hesapları burada da yok.
     * Fark yalnızca sıra ve süzgeç — koltuğu olmayan bu listede işi yok.
     *
     * İkinci sıra ölçütü XP: eşit sayıda ili olan iki başkandan koltuklarını
     * daha uzun süre tutan önde çıkıyor (başkanlıkta geçen her saat XP veriyor).
     */
    const { data, error } = await this.db
      .from("leaderboard")
      .select("id,handle,display_name,avatar_url,x_handle,is_bot,xp,vote_count,leader_count")
      .gt("leader_count", 0)
      .order("leader_count", { ascending: false })
      .order("xp", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as ProfileRow[]).map((row) => ({
      user: authUserFromProfileRow(row),
      xp: row.xp,
      level: levelFromXp(row.xp),
      voteCount: row.vote_count,
      leaderCount: row.leader_count ?? 0,
    }));
  }

  /* ---------------- eylemler ---------------- */

  async castVote(provinceId: string, partyId: string): Promise<VoteResult> {
    const { data, error } = await this.db.rpc("cast_vote", {
      p_province_id: provinceId,
      p_party_id: partyId,
    });
    if (error) return { ok: false, message: error.message };
    const res = data as { ok: boolean; message?: string } | null;
    if (!res?.ok) return { ok: false, message: res?.message ?? "Oy kaydedilemedi." };
    const [profile, detail] = await Promise.all([
      this.getProfile(),
      this.getProvinceDetail(provinceId),
    ]);
    return { ok: true, profile: profile ?? undefined, standing: detail.standing };
  }

  async holdRally(provinceId: string, partyId: string): Promise<RallyResult> {
    const { data, error } = await this.db.rpc("hold_rally", {
      p_province_id: provinceId,
      p_party_id: partyId,
    });
    if (error) return { ok: false, message: error.message };
    const res = data as
      | { ok: boolean; message?: string; votes?: number; next_rally_at?: string }
      | null;
    if (!res?.ok) {
      return {
        ok: false,
        message: res?.message ?? "Miting düzenlenemedi.",
        nextRallyAt: res?.next_rally_at ?? null,
      };
    }
    const detail = await this.getProvinceDetail(provinceId);
    return {
      ok: true,
      votes: res.votes ?? RALLY_VOTES,
      nextRallyAt: res.next_rally_at ?? null,
      standing: detail.standing,
    };
  }

  async getStats(): Promise<SiteStats> {
    /*
     * ÖNCE ZİYARETÇİ, SONRA PROFİL.
     *
     * touch_visitor girişi olmayan da çağırabiliyor; "çevrimiçi" sayacı buna
     * dayanıyor. Eskiden yalnızca touch_presence vardı ve o iki yönden birden
     * eksikti: giriş yapmayanın profili olmadığı için hiç sayılmıyordu,
     * üstelik fonksiyonun kendisi de ölüydü (bkz. 20260825060000 göçü).
     * Sonuç: haritaya bakan yüzlerce kişi sayaçta görünmüyordu.
     *
     * Hata önemli değil: sayaç kozmetik, oyunun işleyişini etkilemiyor.
     */
    void this.db
      .rpc("touch_visitor", { p_device_id: getDeviceIdentity().deviceId })
      .then(() => undefined, () => undefined);

    void this.db.rpc("touch_presence").then(() => undefined, () => undefined);

    // site_stats: profil sayısını ve son 5 dakikada görülen kullanıcıyı
    // tek satırda toplayan görünüm (bkz. migration).
    const { data, error } = await this.db
      .from("site_stats")
      .select("online,total")
      .maybeSingle();
    if (error || !data) return { online: 0, total: 0 };
    return { online: Number(data.online ?? 0), total: Number(data.total ?? 0) };
  }

  async getCustomParties(): Promise<Party[]> {
    const { data, error } = await this.db
      .from("active_custom_parties")
      .select("id,name,short_name,color,logo_url,owner_handle");
    if (error) return [];
    return ((data ?? []) as Array<{
      id: string;
      name: string;
      short_name: string;
      color: string;
      logo_url: string | null;
      owner_handle: string | null;
    }>).map((row) => ({
      id: row.id,
      // Ad görünür, kısaltma rozete basılır — hazır partilerdeki gibi.
      name: row.name,
      shortName: row.short_name,
      fullName: row.name,
      color: row.color,
      on: readableTextTone(row.color),
      custom: true,
      logoUrl: row.logo_url,
      ownerHandle: row.owner_handle,
      blurb: row.owner_handle ? `@${row.owner_handle} tarafından kuruldu.` : undefined,
    }));
  }

  async createParty(input: CustomPartyInput): Promise<CreatePartyResult> {
    const { data, message } = await invokeEdge<{ url?: string }>(
      this.db,
      "create-party-subscription",
      {
        ...input,
        successUrl: `${window.location.origin}${window.location.pathname}#/profil?parti=basarili&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}${window.location.pathname}#/profil?parti=iptal`,
      },
    );
    if (message) return { kind: "error", message };
    const url = data?.url;
    if (!url) return { kind: "error", message: "Ödeme oturumu açılamadı." };
    return { kind: "redirect", url };
  }

  async signInWithGoogle() {
    /*
     * DÖNÜŞ ADRESİNDE # OLMAMALI.
     *
     * Uygulama hash yönlendirmesi kullanıyor. Dönüş adresine `#/profil`
     * yazılınca Supabase'in eklediği `?code=...` hash'in İÇİNDE kalıyordu
     * (".../#/profil?google=basarili&code=xxx"). supabase-js kodu
     * window.location.search içinde arıyor, orada bulamıyor ve oturumu hiç
     * kurmuyordu: kullanıcı Google'da hesabını seçip dönüyor, hiçbir şey
     * olmuyordu.
     *
     * Adres artık temiz kök; kod sorgu dizesine düşüyor ve okunuyor.
     * Kullanıcının bulunduğu sayfa aşağıda saklanıp dönüşte geri veriliyor.
     */
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    try {
      sessionStorage.setItem("partim.lol/giris-donus", window.location.hash || "#/profil");
    } catch {
      /* depolama kapalı olabilir; dönüşte ana sayfada kalır */
    }

    /*
     * Anonim oturum varken önce KİMLİK EKLEME deneniyor: auth kullanıcısı aynı
     * kalıyor, dolayısıyla profil de aynı kalıyor. Bu kapalıysa ya da bu Google
     * hesabı başka bir kullanıcıya bağlıysa normal girişe düşüyoruz; sunucudaki
     * ensure_profile kimliğe göre doğru profili zaten buluyor.
     */
    const { data: oturum } = await this.db.auth.getSession();
    const anonim = oturum.session?.user?.is_anonymous === true;

    if (anonim) {
      const { error } = await this.db.auth.linkIdentity({
        provider: "google",
        options: { redirectTo },
      });
      if (!error) return { ok: true };
    }

    const { error } = await this.db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }

  async confirmCheckout(sessionId: string) {
    const { data, message } = await invokeEdge<{ ok?: boolean; kind?: string }>(
      this.db,
      "confirm-checkout",
      { sessionId },
    );
    if (message) return { ok: false, message };
    this.cachedProfile = null;
    return { ok: !!data?.ok, kind: data?.kind };
  }

  async startFastVotes(): Promise<FastVotesResult> {
    const { data, message } = await invokeEdge<{ url?: string }>(
      this.db,
      "create-fast-votes-subscription",
      {
        successUrl: `${window.location.origin}${window.location.pathname}#/profil?hizli=basarili&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}${window.location.pathname}#/profil?hizli=iptal`,
      },
    );
    if (message) return { kind: "error", message };
    const url = data?.url;
    if (!url) return { kind: "error", message: "Ödeme oturumu açılamadı." };
    return { kind: "redirect", url };
  }

  async cancelFastVotes(iptal: boolean): Promise<{ ok: boolean; message?: string }> {
    const { data, message } = await invokeEdge<{ ok?: boolean }>(
      this.db,
      "cancel-fast-votes-subscription",
      { iptal },
    );
    if (message) return { ok: false, message };
    // Profil önbelleği bayatladı: iptal işareti bir sonraki okumada gelsin.
    this.cachedProfile = null;
    return { ok: !!data?.ok };
  }

  async claimSeat(provinceId: string, partyId: string, amount?: number): Promise<CheckoutResult> {
    const { data, message } = await invokeEdge<{ url?: string; price?: number }>(
      this.db,
      "create-checkout",
      {
        provinceId,
        partyId,
        // Tutar ucu açık. Sunucu yine de alt sınırı kendisi hesaplayıp
        // doğruluyor — istemcinin gönderdiği sayıya güvenilmez.
        amount,
        successUrl: `${window.location.origin}${window.location.pathname}#/il/${provinceId}?odeme=basarili&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}${window.location.pathname}#/il/${provinceId}?odeme=iptal`,
      },
    );
    if (message) return { kind: "error", message };
    const url = data?.url;
    if (!url) return { kind: "error", message: "Ödeme oturumu açılamadı." };

    /*
     * Açılacak tutar istenenle aynı mı?
     *
     * Fonksiyonun eski sürümü `amount` alanını hiç okumuyor ve her zaman alt
     * sınırı kullanıyordu: kullanıcı $10 yazsa da Stripe $1 açıyordu. Sessizce
     * yanlış tutara yönlendirmek, karşısındakinin parasıyla oynamak demek —
     * o yüzden fark varsa yönlendirmiyoruz ve sebebini söylüyoruz.
     */
    const istenen = amount ?? data?.price;
    if (
      istenen !== undefined &&
      typeof data?.price === "number" &&
      Math.abs(data.price - istenen) > 0.005
    ) {
      return {
        kind: "error",
        message:
          `Ödeme ekranı ${formatUsd(data.price)} olarak açılacaktı, oysa ${formatUsd(istenen)} ` +
          "istendi. Ödeme servisi eski sürümde: GitHub → Actions → \"Supabase'e uygula\" → " +
          "hedef: fonksiyonlar.",
      };
    }

    return { kind: "redirect", url };
  }
}
