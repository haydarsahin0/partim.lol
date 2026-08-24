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
import { normalizeRecoveryCode, type DeviceIdentity } from "@/lib/device";
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
    const { data: sessionData } = await this.db.auth.getSession();
    if (!sessionData.session) {
      const { error } = await this.db.auth.signInAnonymously();
      if (error) throw error;
    }

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
        cb(session ? await this.getUser() : null);
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

    const { data, error } = await this.db
      .from("profiles")
      .select(
        "id,handle,display_name,avatar_url,x_handle,xp,vote_count,leader_count,next_vote_at,unlimited_votes,fast_votes_until,created_at",
      )
      .eq("auth_user_id", sessionData.session.user.id)
      .maybeSingle();
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
    const [seedRes, historyRes] = await Promise.all([
      this.db.from("seed_snapshot").select("province_id,party_id,votes"),
      this.db.rpc("vote_history", { p_bucket: bucket, p_since: null }),
    ]);

    const seed: VoteHistory["seed"] = {};
    for (const row of (seedRes.data ?? []) as Array<{
      province_id: string;
      party_id: string;
      votes: number;
    }>) {
      (seed[row.province_id] ??= {})[row.party_id] = row.votes;
    }

    const byBucket = new Map<string, VoteHistory["seed"]>();
    for (const row of (historyRes.data ?? []) as Array<{
      bucket: string;
      province_id: string;
      party_id: string;
      votes: number;
    }>) {
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
    const { data, error } = await this.db
      .from("profiles")
      .select("id,handle,display_name,avatar_url,x_handle,is_bot,xp,vote_count,leader_count")
      // Oyunun kendi hesapları sıralamada yer almaz: liste gerçek oyuncular içindir.
      .eq("is_bot", false)
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
    // Giriş yapan kullanıcı için "çevrimiçi" işaretini tazele. Hata önemli
    // değil: sayaç kozmetik, oyunun işleyişini etkilemiyor.
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
        successUrl: `${window.location.origin}${window.location.pathname}#/profil?parti=basarili`,
        cancelUrl: `${window.location.origin}${window.location.pathname}#/profil?parti=iptal`,
      },
    );
    if (message) return { kind: "error", message };
    const url = data?.url;
    if (!url) return { kind: "error", message: "Ödeme oturumu açılamadı." };
    return { kind: "redirect", url };
  }

  async startFastVotes(): Promise<FastVotesResult> {
    const { data, message } = await invokeEdge<{ url?: string }>(
      this.db,
      "create-fast-votes-subscription",
      {
        successUrl: `${window.location.origin}${window.location.pathname}#/profil?hizli=basarili`,
        cancelUrl: `${window.location.origin}${window.location.pathname}#/profil?hizli=iptal`,
      },
    );
    if (message) return { kind: "error", message };
    const url = data?.url;
    if (!url) return { kind: "error", message: "Ödeme oturumu açılamadı." };
    return { kind: "redirect", url };
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
        successUrl: `${window.location.origin}${window.location.pathname}#/il/${provinceId}?odeme=basarili`,
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
