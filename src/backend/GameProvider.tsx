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
import { FAST_VOTE_COOLDOWN_LABEL, RALLY_VOTES } from "@/lib/game";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";
import { getDeviceIdentity } from "@/lib/device";
import { getBackend } from "./index";
import type {
  AuthUser,
  Backend,
  CreatePartyResult,
  CustomPartyInput,
  ProfilePatch,
  ProfileUpdateResult,
  LeaderSeat,
  Profile,
  ProvinceStanding,
  SiteStats,
} from "./types";

type GameContextValue = {
  backend: Backend;
  isDemo: boolean;
  mapKind: "siyasi" | "futbol";
  switchMap: (kind: "siyasi" | "futbol") => void;
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
  /** Hesabın hazır olup olmadığı; açılışta kısa süre false olur */
  ready: boolean;
  updateProfile: (patch: ProfilePatch) => Promise<ProfileUpdateResult>;
  /** Kullanıcı adı müsait mi? Kaydetmeden önce sorulur. */
  checkHandle: (
    handle: string,
  ) => Promise<{ ok: boolean; message?: string; kontrolEdilemedi?: boolean }>;
  restoreAccount: (code: string) => Promise<ProfileUpdateResult>;
  claimUnlimited: (code: string) => Promise<ProfileUpdateResult>;
  getRecoveryCode: () => Promise<string | null>;
  vote: (provinceId: string, partyId: string) => Promise<boolean>;
  claimSeat: (provinceId: string, partyId: string, amount?: number) => Promise<LeaderSeat | null>;
  createParty: (input: CustomPartyInput) => Promise<CreatePartyResult>;
  /** Miting düzenler; başarılıysa true döner */
  holdRally: (provinceId: string, partyId: string) => Promise<boolean>;
  /** Hızlı oy aboneliğini başlatır; gerçek modda Stripe'a yönlendirir */
  startFastVotes: () => Promise<boolean>;
  /**
   * Hızlı oy aboneliğini iptal eder ya da iptali geri alır.
   * İptal hakkı hemen kesmiyor: dönem sonuna kadar sürüyor.
   */
  cancelFastVotes: (iptal: boolean) => Promise<boolean>;
  /** Hesabı Google kimliğine bağlar */
  signInWithGoogle: () => Promise<boolean>;
  /** Oturum açık mı? Kapalıysa oyun izlenebilir ama oynanamaz. */
  signedIn: boolean;
  /**
   * Bir eylem hesap gerektiriyor. Oturum varsa true döner; yoksa giriş
   * penceresini açıp false döner — çağıran eylemi yapmadan çıkar.
   */
  requireAuth: (sebep?: string) => boolean;
  /** Giriş penceresinin açık olma sebebi; null ise kapalı. */
  girisSebebi: string | null;
  girisKapat: () => void;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const isDemo = backend.mode === "demo";

  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [standings, setStandings] = useState<Record<string, ProvinceStanding>>({});
  const [parties, setParties] = useState<Party[]>(PARTIES);
  const [mapKind, setMapKind] = useState<"siyasi" | "futbol">("siyasi");
  const [stats, setStats] = useState<SiteStats>({ online: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
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
      // Oturum varsa profili kur; yoksa ziyaretçi olarak devam — kayıt
      // Google üzerinden yürüyor, kendiliğinden hesap açılmıyor.
      try {
        const profile = await backend.ensureSession(getDeviceIdentity());
        if (!cancelled && profile) {
          setProfile(profile);
          setUser({
            id: profile.id,
            handle: profile.handle,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            xHandle: profile.xHandle,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Hesap açılamadı.");
        }
      } finally {
        if (!cancelled) setReady(true);
      }

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

  const checkHandle = useCallback(
    (handle: string) => backend.checkHandle(handle),
    [backend],
  );

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      const result = await backend.updateProfile(patch);
      if (!result.ok) {
        toast.error(result.message);
        return result;
      }
      setProfile(result.profile);
      setUser({
        id: result.profile.id,
        handle: result.profile.handle,
        displayName: result.profile.displayName,
        avatarUrl: result.profile.avatarUrl,
        xHandle: result.profile.xHandle,
      });
      toast.success("Profilin güncellendi.");
      return result;
    },
    [backend],
  );

  const restoreAccount = useCallback(
    async (code: string) => {
      const result = await backend.restoreAccount(code, getDeviceIdentity());
      if (!result.ok) {
        toast.error(result.message);
        return result;
      }
      setProfile(result.profile);
      setUser({
        id: result.profile.id,
        handle: result.profile.handle,
        displayName: result.profile.displayName,
        avatarUrl: result.profile.avatarUrl,
        xHandle: result.profile.xHandle,
      });
      await Promise.all([refresh(), refreshParties()]);
      toast.success("Hesabın bu cihaza geri yüklendi.");
      return result;
    },
    [backend, refresh, refreshParties],
  );

  const claimUnlimited = useCallback(
    async (code: string) => {
      const result = await backend.claimUnlimited(code);
      if (!result.ok) {
        toast.error(result.message);
        return result;
      }
      setProfile(result.profile);
      toast.success("Sınırsız oy hakkı bu hesaba tanımlandı.");
      return result;
    },
    [backend],
  );

  const getRecoveryCode = useCallback(() => backend.getRecoveryCode(), [backend]);

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

  /*
   * Giriş kapısı.
   *
   * Hesap artık kendiliğinden açılmıyor: kayıt Google üzerinden yürüyor.
   * Ama haritayı görmek için giriş istemiyoruz — insanlar oyunu görmeden
   * gitmesin. Giriş yalnızca bir şey YAPMAYA kalkınca isteniyor.
   */
  const [girisSebebi, setGirisSebebi] = useState<string | null>(null);
  const girisKapat = useCallback(() => setGirisSebebi(null), []);
  const requireAuth = useCallback(
    (sebep?: string) => {
      if (user) return true;
      setGirisSebebi(sebep ?? "Devam etmek için giriş yapman gerekiyor.");
      return false;
    },
    [user],
  );

  const signInWithGoogle = useCallback(async () => {
    const result = await backend.signInWithGoogle();
    if (!result.ok) {
      toast.error(result.message ?? "Google ile bağlanılamadı.");
      return false;
    }
    /*
     * Gerçek modda tarayıcı Google'a gidiyor ve bu satırlara dönülmüyor.
     * Demo modda hesap hemen açıldığı için profili tazeleyip pencereyi
     * kapatıyoruz — açık kalırsa kullanıcı giriş yaptığı hâlde önünde duruyor.
     */
    await refreshProfile();
    setGirisSebebi(null);
    return true;
  }, [backend, refreshProfile]);

  const startFastVotes = useCallback(async () => {
    const result = await backend.startFastVotes();
    if (result.kind === "error") {
      toast.error(result.message);
      return false;
    }
    if (result.kind === "redirect") {
      window.location.assign(result.url);
      return true;
    }
    setProfile(result.profile);
    toast.success(`Hızlı oy açıldı: artık ${FAST_VOTE_COOLDOWN_LABEL}.`);
    return true;
  }, [backend]);

  const cancelFastVotes = useCallback(
    async (iptal: boolean) => {
      const result = await backend.cancelFastVotes(iptal);
      if (!result.ok) {
        toast.error(result.message ?? "Abonelik güncellenemedi.");
        return false;
      }
      // İptal işareti sunucuda; profili tazeleyip olduğu gibi gösteriyoruz.
      await refreshProfile();
      toast.success(
        iptal
          ? "Abonelik iptal edildi. Ödediğin dönemin sonuna kadar hızlı oy sende."
          : "Abonelik sürüyor: iptal geri alındı.",
      );
      return true;
    },
    [backend, refreshProfile],
  );

  const holdRally = useCallback(
    async (provinceId: string, partyId: string) => {
      const result = await backend.holdRally(provinceId, partyId);
      if (!result.ok) {
        toast.error(result.message ?? "Miting düzenlenemedi.");
        return false;
      }
      if (result.standing) {
        setStandings((prev) => ({ ...prev, [provinceId]: result.standing! }));
      } else {
        void refresh();
      }
      toast.success(
        `${PROVINCE_BY_ID[provinceId]?.name} mitingi! ${partyName(partyId)} +${
          result.votes ?? RALLY_VOTES
        } oy aldı.`,
      );
      return true;
    },
    [backend, refresh],
  );

  const claimSeat = useCallback(
    async (provinceId: string, partyId: string, amount?: number) => {
      const result = await backend.claimSeat(provinceId, partyId, amount);
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

  /* Harita değiştirme */
  const switchMap = useCallback(
    (kind: "siyasi" | "futbol") => {
      setMapKind(kind);
      if (kind === "futbol") {
        setCustomParties(FOOTBALL_TEAMS);
      } else {
        setCustomParties([]);
      }
      (backend as unknown as { setMapKind?: (k: string) => void })?.setMapKind?.(kind);
      void refresh();
      void refreshParties();
    },
    [backend, refresh, refreshParties],
  );

  const value: GameContextValue = {
    backend,
    isDemo,
    mapKind,
    switchMap,
    user,
    profile,
    standings,
    parties,
    stats,
    national,
    totalVotes,
    loading,
    ready,
    error,
    refresh,
    refreshProfile,
    updateProfile,
    checkHandle,
    restoreAccount,
    claimUnlimited,
    getRecoveryCode,
    vote,
    claimSeat,
    createParty,
    holdRally,
    startFastVotes,
    cancelFastVotes,
    signInWithGoogle,
    signedIn: !!user,
    requireAuth,
    girisSebebi,
    girisKapat,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame yalnızca <GameProvider> içinde kullanılabilir.");
  return ctx;
}
