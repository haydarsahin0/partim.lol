import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FootballSeat,
  ProvinceStanding,
} from "@/backend/types";
import { getBackend } from "@/backend";
import { PROVINCES } from "@/data/provinces";
import {
  FOOTBALL_TEAMS,
  setCustomClubs,
  type FootballTeam,
} from "@/data/footballTeams";

/**
 * Futbol haritası oyun durumu.
 *
 * - Supabase modunda: football_* tablolarındaki gerçek veri (football_cast_vote,
 *   football_daily_votes, football_seats RPC'leri). Oylar ve koltuklar kalıcıdır.
 * - Demo modunda: tarayıcıda localStorage (futbol oyları siyasi veriden ayrı
 *   tutulur; koltuk satın alma simüle edilir).
 *
 * Bu hook yalnızca futbol haritasını besler; ana harita GameProvider'dadır.
 */

export function useFootballMapGame() {
  const backend = useMemo(() => getBackend(), []);
  const isDemo = backend.mode === "demo";

  const [standings, setStandings] = useState<Record<string, ProvinceStanding>>({});
  const [seats, setSeats] = useState<FootballSeat[]>([]);
  const [mySeats, setMySeats] = useState<FootballSeat[]>([]);
  const [nextVoteAt, setNextVoteAt] = useState<string | null>(null);
  const [clubs, setClubs] = useState<FootballTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, seatList, mySeatList, customClubs] = await Promise.all([
        backend.getFootballStandings(),
        backend.getFootballSeats(),
        backend.getFootballMySeats(),
        backend.getCustomClubs(),
      ]);
      setStandings(s);
      setSeats(seatList);
      setMySeats(mySeatList);
      // Kullanıcı kulüplerini canlı dizine yaz: pusula ve sonuçlar buradan okur.
      const custom: FootballTeam[] = customClubs.map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        fullName: c.name,
        color: c.color,
        on: "light",
        provinceId: "",
        cityId: "",
        cityName: "Türkiye geneli",
        blurb: "Kullanıcıların kurduğu kulüp.",
        custom: true,
        logoUrl: c.logoUrl,
        ownerHandle: c.ownerHandle,
      }));
      if (custom.length > 0) setCustomClubs(custom);
      setClubs(custom);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Futbol verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const vote = useCallback(
    async (provinceId: string, teamId: string): Promise<{ ok: boolean; message?: string }> => {
      const result = await backend.castFootballVote(provinceId, teamId);
      if (result.ok) {
        // Geri sayım anında başlasın: sunucu bir sonraki oy anını döndürüyor.
        if (result.nextVoteAt !== undefined) setNextVoteAt(result.nextVoteAt);
        if (result.standing) {
          setStandings((prev) => ({ ...prev, [provinceId]: result.standing! }));
        } else {
          void refresh();
        }
      }
      return { ok: result.ok, message: result.message };
    },
    [backend, refresh],
  );

  /** Kulüp başkanlığı satın alır; gerçek modda Stripe'a yönlendirir. */
  const claimSeat = useCallback(
    async (provinceId: string, clubId: string, amount?: number) => {
      const result = await backend.claimFootballSeat(provinceId, clubId, amount);
      // Demo modunda koltuk anında sahiplenilir: başkan etiketleri tazelensin.
      if (result.kind === "done") void refresh();
      return result;
    },
    [backend, refresh],
  );

  /** Kulüp başkanı günde 1 kez kulübüne 60 oy ekler. */
  const dailyVotes = useCallback(
    async (provinceId: string, clubId: string) => {
      const result = await backend.holdFootballDailyVotes(provinceId, clubId);
      if (result.ok) {
        if (result.standing) {
          setStandings((prev) => ({ ...prev, [provinceId]: result.standing! }));
        } else {
          void refresh();
        }
        void refresh();
      }
      return result;
    },
    [backend, refresh],
  );

  const createClub = useCallback(
    async (input: { name: string; shortName: string; color: string; logoDataUrl?: string | null }) => {
      const result = await backend.createClub({
        name: input.name,
        shortName: input.shortName,
        color: input.color,
        logoDataUrl: input.logoDataUrl ?? null,
      });
      if (result.kind === "done") {
        void refresh();
      }
      return result;
    },
    [backend, refresh],
  );

  /** Ülke geneli takım toplamları: oy sayısı ve yüzdesi (oy sırasına göre). */
  const national = useMemo(() => {
    const byTeam = new Map<string, number>();
    let total = 0;
    for (const province of PROVINCES) {
      const standing = standings[province.id];
      if (!standing) continue;
      total += standing.totalVotes;
      for (const tally of standing.tallies) {
        byTeam.set(tally.partyId, (byTeam.get(tally.partyId) ?? 0) + tally.votes);
      }
    }
    return [...byTeam.entries()]
      .map(([teamId, votes]) => ({
        teamId,
        votes,
        pct: total > 0 ? (votes / total) * 100 : 0,
      }))
      .sort((a, b) => b.votes - a.votes);
  }, [standings]);

  /** Oy pusulasında görünecek takımlar: 4 büyük en üstte, sonra kullanıcı kulüpleri, sonra alfabetik. */
  const ballotTeams = useMemo(() => {
    const sorted = [...FOOTBALL_TEAMS].sort((a, b) => a.name.localeCompare(b.name, "tr"));
    const majors = sorted.filter((t) => t.major);
    const rest = sorted.filter((t) => !t.major);
    return [...majors, ...rest];
  }, [clubs.length]);

  const totalVotes = useMemo(
    () => Object.values(standings).reduce((sum, s) => sum + s.totalVotes, 0),
    [standings],
  );

  return {
    standings,
    seats,
    mySeats,
    nextVoteAt,
    vote,
    claimSeat,
    dailyVotes,
    createClub,
    national,
    totalVotes,
    clubs,
    ballotTeams,
    loading,
    error,
    refresh,
    isDemo,
  };
}
