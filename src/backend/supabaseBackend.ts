/**
 * Gerçek arka uç: Supabase (Twitter/X OAuth + Postgres) ve Stripe Checkout.
 *
 * Şema ve sunucu tarafı kurallar `supabase/migrations/20260823120000_init.sql` içindedir; oy soğuma süresi,
 * XP ve koltuk fiyatı orada da doğrulanır — istemciye güvenilmez.
 */
import type { Session, User } from "@supabase/supabase-js";
import { PARTY_IDS } from "@/data/parties";
import { fallbackAvatar } from "@/lib/avatar";
import { LEADER_BASE_PRICE, levelFromXp, nextLeaderPrice } from "@/lib/game";
import { getSupabase } from "./supabaseClient";
import type {
  AuthUser,
  Backend,
  CheckoutResult,
  LeaderSeat,
  LeaderboardEntry,
  Profile,
  ProvinceDetail,
  ProvinceStanding,
  VoteResult,
} from "./types";

type TallyRow = { province_id: string; party_id: string; votes: number };
type SeatRow = {
  province_id: string;
  party_id: string;
  price: number | string;
  held_since: string | null;
  takeovers: number;
  holder: { id: string; handle: string; display_name: string; avatar_url: string | null } | null;
};
type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  xp: number;
  vote_count: number;
  leader_count: number;
  next_vote_at: string | null;
  created_at: string;
};

function userFromSession(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const handle =
    (meta.user_name as string) ||
    (meta.preferred_username as string) ||
    (meta.screen_name as string) ||
    user.email?.split("@")[0] ||
    user.id.slice(0, 8);
  return {
    id: user.id,
    handle,
    displayName: (meta.full_name as string) || (meta.name as string) || handle,
    avatarUrl: (meta.avatar_url as string) || fallbackAvatar(handle),
  };
}

function authUserFromRow(row: SeatRow["holder"]): AuthUser | null {
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name || row.handle,
    avatarUrl: row.avatar_url ?? fallbackAvatar(row.handle),
  };
}

function seatFromRow(row: SeatRow): LeaderSeat {
  const price = Number(row.price ?? 0);
  return {
    provinceId: row.province_id,
    partyId: row.party_id,
    holder: authUserFromRow(row.holder),
    price,
    nextPrice: nextLeaderPrice(price),
    heldSince: row.held_since,
    takeovers: row.takeovers ?? 0,
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

export class SupabaseBackend implements Backend {
  readonly mode = "supabase" as const;

  private get db() {
    return getSupabase();
  }

  /* ---------------- kimlik ---------------- */

  async getUser(): Promise<AuthUser | null> {
    const { data } = await this.db.auth.getSession();
    return userFromSession(data.session?.user);
  }

  async signInWithTwitter(): Promise<void> {
    const { error } = await this.db.auth.signInWithOAuth({
      provider: "twitter",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  onAuthChange(cb: (user: AuthUser | null) => void): () => void {
    const { data } = this.db.auth.onAuthStateChange((_event: string, session: Session | null) => {
      cb(userFromSession(session?.user));
    });
    return () => data.subscription.unsubscribe();
  }

  /* ---------------- okuma ---------------- */

  async getProfile(): Promise<Profile | null> {
    const user = await this.getUser();
    if (!user) return null;
    const { data, error } = await this.db
      .from("profiles")
      .select("id,handle,display_name,avatar_url,xp,vote_count,leader_count,next_vote_at,created_at")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    const row = data as ProfileRow | null;
    if (!row) {
      // Profil tetikleyicisi henüz çalışmadıysa oturum bilgisiyle idare et
      return {
        ...user,
        xp: 0,
        level: 1,
        voteCount: 0,
        leaderCount: 0,
        nextVoteAt: null,
        createdAt: new Date().toISOString(),
      };
    }
    return {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name || row.handle,
      avatarUrl: row.avatar_url ?? fallbackAvatar(row.handle),
      xp: row.xp,
      level: levelFromXp(row.xp),
      voteCount: row.vote_count,
      leaderCount: row.leader_count ?? 0,
      nextVoteAt: row.next_vote_at,
      createdAt: row.created_at,
    };
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
        .select("province_id,party_id,price,held_since,takeovers,holder:profiles(id,handle,display_name,avatar_url)")
        .eq("province_id", provinceId),
      this.db
        .from("recent_votes")
        .select("handle,party_id,created_at")
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
      recentVotes: ((recentRes.data ?? []) as Array<{ handle: string; party_id: string; created_at: string }>).map(
        (r) => ({ handle: r.handle, partyId: r.party_id, at: r.created_at }),
      ),
    };
  }

  async getMySeats(): Promise<LeaderSeat[]> {
    const user = await this.getUser();
    if (!user) return [];
    const { data, error } = await this.db
      .from("leader_seats")
      .select("province_id,party_id,price,held_since,takeovers,holder:profiles(id,handle,display_name,avatar_url)")
      .eq("user_id", user.id)
      .order("held_since", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as SeatRow[]).map(seatFromRow);
  }

  async getLeaderboard(limit = 25): Promise<LeaderboardEntry[]> {
    const { data, error } = await this.db
      .from("profiles")
      .select("id,handle,display_name,avatar_url,xp,vote_count,leader_count")
      .order("xp", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as ProfileRow[]).map((row) => ({
      user: {
        id: row.id,
        handle: row.handle,
        displayName: row.display_name || row.handle,
        avatarUrl: row.avatar_url ?? fallbackAvatar(row.handle),
      },
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

  async claimSeat(provinceId: string, partyId: string): Promise<CheckoutResult> {
    const { data, error } = await this.db.functions.invoke("create-checkout", {
      body: {
        provinceId,
        partyId,
        successUrl: `${window.location.origin}${window.location.pathname}#/il/${provinceId}?odeme=basarili`,
        cancelUrl: `${window.location.origin}${window.location.pathname}#/il/${provinceId}?odeme=iptal`,
      },
    });
    if (error) return { kind: "error", message: error.message };
    const url = (data as { url?: string } | null)?.url;
    if (!url) return { kind: "error", message: "Ödeme oturumu açılamadı." };
    return { kind: "redirect", url };
  }
}
