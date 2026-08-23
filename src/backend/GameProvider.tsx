import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { PARTIES, partyName, setCustomParties, type Party } from "@/data/parties";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";
import { getBackend } from "./index";
import { DemoBackend } from "./demoBackend";
import type {
  AuthUser,
  Backend,
  CreatePartyResult,
  CustomPartyInput,
  LeaderSeat,
  Profile,
  ProvinceStanding,
  SiteStats,
} from "./types";

type GameContextValue = {
  backend: Backend;
  isDemo: boolean;
  user: AuthUser | null;
  profile: Profile | null;
  standings: Record<string, ProvinceStanding>;
  /** Sabit partiler + kullanıcıların kurdukları */
  parties: Party[];
  stats: SiteStats;
  /** Ülke geneli parti toplamları, oy sırasına göre */
  national: Array<{ partyId: string; votes: number; pct: number; provinces: number }>;
  totalVotes: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signIn: (handle?: string) => Promise<void>;
  signOut: () => Promise<void>;
  vote: (provinceId: string, partyId: string) => Promise<boolean>;
  claimSeat: (provinceId: string, partyId: string) => Promise<LeaderSeat | null>;
  createParty: (input: CustomPartyInput) => Promise<CreatePartyResult>;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const isDemo = backend.mode === "demo";

  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [standings, setStandings] = useState<Record<string, ProvinceStanding>>({});
  const [parties, setParties] = useState<Party[]>(PARTIES);
  const [stats, setStats] = useState<SiteStats>({ online: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await backend.getStandings();
      if (mounted.current) {
        setStandings(next);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "Veriler alınamadı.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [backend]);

  /** Özel partileri canlı dizine yazar ve yeniden çizimi tetikler. */
  const refreshParties = useCallback(async () => {
    try {
      const custom = await backend.getCustomParties();
      setCustomParties(custom);
      if (mounted.current) setParties([...PARTIES]);
    } catch {
      /* özel partiler alınamazsa sabit liste yeterli */
    }
  }, [backend]);

  const refreshStats = useCallback(async () => {
    try {
      const next = await backend.getStats();
      if (mounted.current) setStats(next);
    } catch {
      /* sayaç kritik değil */
    }
  }, [backend]);

  const refreshProfile = useCallback(async () => {
    try {
      const next = await backend.getProfile();
      if (mounted.current) setProfile(next);
    } catch {
      if (mounted.current) setProfile(null);
    }
  }, [backend]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await backend.getUser();
      if (!cancelled) setUser(current);
      // Partiler önce yüklensin: harita boyaması onlara bağlı.
      await refreshParties();
      await Promise.all([refresh(), refreshProfile(), refreshStats()]);
    })();
    const unsubscribe = backend.onAuthChange((next) => {
      setUser(next);
      void refreshProfile();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [backend, refresh, refreshProfile, refreshParties, refreshStats]);

  // İl başkanlığı XP'si saat başı işlendiği için profili düzenli tazeliyoruz.
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => void refreshProfile(), 60_000);
    return () => window.clearInterval(id);
  }, [user, refreshProfile]);

  // Canlı sayaç: hap "canlı" hissettirsin diye 20 saniyede bir tazelenir.
  useEffect(() => {
    const id = window.setInterval(() => void refreshStats(), 20_000);
    return () => window.clearInterval(id);
  }, [refreshStats]);

  const signIn = useCallback(
    async (handle?: string) => {
      try {
        if (backend instanceof DemoBackend) {
          await backend.demoSignIn(handle ?? "");
        } else {
          await backend.signInWithTwitter();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Giriş yapılamadı.");
      }
    },
    [backend],
  );

  const signOut = useCallback(async () => {
    await backend.signOut();
    setProfile(null);
  }, [backend]);

  const vote = useCallback(
    async (provinceId: string, partyId: string) => {
      const result = await backend.castVote(provinceId, partyId);
      if (!result.ok) {
        toast.error(result.message ?? "Oy kullanılamadı.");
        return false;
      }
      if (result.profile) setProfile(result.profile);
      if (result.standing) {
        setStandings((prev) => ({ ...prev, [provinceId]: result.standing! }));
      } else {
        void refresh();
      }
      toast.success(
        `${PROVINCE_BY_ID[provinceId]?.name} için ${partyName(partyId)} oyun kaydedildi. +1 XP`,
      );
      return true;
    },
    [backend, refresh],
  );

  const claimSeat = useCallback(
    async (provinceId: string, partyId: string) => {
      const result = await backend.claimSeat(provinceId, partyId);
      if (result.kind === "error") {
        toast.error(result.message);
        return null;
      }
      if (result.kind === "redirect") {
        window.location.assign(result.url);
        return null;
      }
      setProfile(result.profile);
      toast.success(
        `${PROVINCE_BY_ID[provinceId]?.name} ${partyName(partyId)} il başkanlığı senin!`,
      );
      return result.seat;
    },
    [backend],
  );

  const createParty = useCallback(
    async (input: CustomPartyInput) => {
      const result = await backend.createParty(input);
      if (result.kind === "error") {
        toast.error(result.message);
        return result;
      }
      if (result.kind === "redirect") {
        window.location.assign(result.url);
        return result;
      }
      await refreshParties();
      toast.success(`${input.name} kuruldu! Artık haritada oy alabilir.`);
      return result;
    },
    [backend, refreshParties],
  );

  const { national, totalVotes } = useMemo(() => {
    const byParty = new Map<string, { votes: number; provinces: number }>();
    let total = 0;
    for (const province of PROVINCES) {
      const standing = standings[province.id];
      if (!standing) continue;
      total += standing.totalVotes;
      for (const tally of standing.tallies) {
        const row = byParty.get(tally.partyId) ?? { votes: 0, provinces: 0 };
        row.votes += tally.votes;
        byParty.set(tally.partyId, row);
      }
      if (standing.leadingPartyId) {
        const row = byParty.get(standing.leadingPartyId)!;
        row.provinces += 1;
      }
    }
    const list = [...byParty.entries()]
      .map(([partyId, row]) => ({
        partyId,
        votes: row.votes,
        provinces: row.provinces,
        pct: total ? (row.votes / total) * 100 : 0,
      }))
      .sort((a, b) => b.votes - a.votes);
    return { national: list, totalVotes: total };
  }, [standings]);

  const value: GameContextValue = {
    backend,
    isDemo,
    user,
    profile,
    standings,
    parties,
    stats,
    national,
    totalVotes,
    loading,
    error,
    refresh,
    refreshProfile,
    signIn,
    signOut,
    vote,
    claimSeat,
    createParty,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame yalnızca <GameProvider> içinde kullanılabilir.");
  return ctx;
}
