import { useMemo, useState } from "react";
import { Check, Crown, Loader2, Search, Vote, Zap } from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";
import { useGame } from "@/backend/GameProvider";
import { FOOTBALL_TEAMS, teamColor, teamName, type FootballTeam } from "@/data/footballTeams";
import type { FootballSeat } from "@/backend/types";
import {
  FAST_VOTE_COOLDOWN_LABEL,
  formatDuration,
  formatUsd,
  hasFastVotes,
  hasUnlimitedVotes,
} from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FootballPresident } from "@/components/FootballPresident";
import { cn } from "@/lib/utils";

const normalize = (text: string) =>
  text
    .toLocaleLowerCase("tr")
    .replace(/[ıi̇]/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a");

export function FootballVoteBallot({
  provinceId,
  provinceName,
  nextVoteAt,
  onVote,
  ballotTeams,
  seats,
  onClaimSeat,
  onDailyVotes,
  dailyBusy,
}: {
  provinceId: string;
  provinceName: string;
  nextVoteAt: string | null;
  onVote: (provinceId: string, teamId: string) => Promise<boolean> | boolean;
  ballotTeams?: FootballTeam[];
  /** Bu ildeki tüm başkanlık koltukları; seçilen takımınki içeride bulunur */
  seats?: FootballSeat[];
  /** Kulüp başkanlığı satın al ($1'den başlar) */
  onClaimSeat: (provinceId: string, teamId: string) => Promise<boolean>;
  /** Başkanın günde 60 oyu */
  onDailyVotes: (provinceId: string, teamId: string) => Promise<boolean>;
  dailyBusy?: boolean;
}) {
  const { profile, startFastVotes, requireAuth } = useGame();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hizliBusy, setHizliBusy] = useState(false);
  const [query, setQuery] = useState("");

  const unlimited = hasUnlimitedVotes(profile);
  const hizli = hasFastVotes(profile);
  const cooldown = useCountdown(nextVoteAt);
  const locked = !unlimited && cooldown > 0;

  const hizliAc = async () => {
    if (!requireAuth("Aboneliğin hesabına bağlanması için önce giriş yap.")) return;
    setHizliBusy(true);
    try {
      await startFastVotes();
    } finally {
      setHizliBusy(false);
    }
  };

  const filteredTeams = useMemo(() => {
    // 4 büyük en üstte, ardından kullanıcı kulüpleri, sonra alfabetik.
    const base = ballotTeams ?? [...FOOTBALL_TEAMS].sort((a, b) => a.name.localeCompare(b.name, "tr"));
    const q = normalize(query.trim());
    if (!q) return base;
    return base.filter((team) => {
      const n = normalize(team.name);
      return n.includes(q) || normalize(team.cityName).includes(q);
    });
  }, [query, ballotTeams]);

  const submitVote = async () => {
    if (!selected || locked) return;
    setBusy(true);
    try {
      const ok = await onVote(provinceId, selected);
      if (ok) setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  const daily = async () => {
    if (!selected || dailyBusy) return;
    try {
      await onDailyVotes(provinceId, selected);
    } finally {
      /* busy durumu üst bileşende */
    }
  };

  const selectedSeat = selected ? (seats ?? []).find((s) => s.clubId === selected) ?? null : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold">Takım pusulası</h3>
        <span className="text-xs text-muted-foreground">1 dakikada 1 oy</span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Takım ara — yazdıkça listelenir (şehir veya takım adı)"
          className="pl-9"
        />
      </div>

      <ul className="thin-scroll grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {filteredTeams.map((team) => {
          const isSelected = selected === team.id;
          const seat = (seats ?? []).find(
            (s) => s.clubId === team.id && s.provinceId === provinceId,
          );
          return (
            <li
              key={team.id}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-2 transition-all",
                isSelected
                  ? "border-white/40 bg-white/[0.09] shadow-lg"
                  : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.06]",
              )}
            >
              <button
                type="button"
                onClick={() => setSelected(isSelected ? null : team.id)}
                aria-pressed={isSelected}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-white"
                  style={{ background: teamColor(team.id) }}
                >
                  {isSelected ? <Check className="size-3.5" /> : <span className="size-2.5 rounded-full bg-white/90" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{team.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{team.cityName}</span>
                </span>
              </button>

              {/* Başkan + devral/başkan ol — takımın hemen yanında */}
              <FootballPresident
                provinceId={provinceId}
                clubId={team.id}
                seat={seat}
                onClaimSeat={onClaimSeat}
                tint={teamColor(team.id)}
                stacked
              />
            </li>
          );
        })}
      </ul>

      {query.trim() && filteredTeams.length === 0 && (
        <p className="text-xs text-muted-foreground">Aramana uyan takım bulunamadı.</p>
      )}

      <Button
        className="w-full"
        size="lg"
        variant={selected && !locked ? "primary" : "default"}
        disabled={!selected || locked || busy}
        onClick={() => void submitVote()}
        style={selected && !locked ? { background: teamColor(selected), color: "#ffffff" } : undefined}
      >
        {busy ? (
          <Loader2 className="animate-spin" />
        ) : locked ? (
          <>Sonraki oy: {formatDuration(cooldown)}</>
        ) : (
          <>
            <Vote />
            {selected ? `${provinceName} için ${teamName(selected)} oy ver` : "Bir takım seç"}
          </>
        )}
      </Button>

      {/* Hızlı oy — günlük $3 abonelik, bekleme 15 saniyeye düşer */}
      {!unlimited &&
        (hizli ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-3 py-2">
            <Zap className="size-4 shrink-0 fill-amber-300 text-amber-300" />
            <span className="text-[12px] leading-snug">
              <strong className="text-foreground">Hızlı oy açık</strong>{" "}
              <span className="text-muted-foreground">
                — {FAST_VOTE_COOLDOWN_LABEL}, her gün kendiliğinden yenilenir.
              </span>
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void hizliAc()}
            disabled={hizliBusy}
            className={cn(
              "group relative isolate w-full overflow-hidden rounded-2xl px-3.5 py-3 text-left",
              "border border-amber-300/25 bg-[radial-gradient(120%_140%_at_0%_0%,hsl(43_96%_56%_/_0.16)_0%,hsl(43_96%_56%_/_0.05)_45%,transparent_75%)]",
              "shadow-[inset_0_1px_0_0_hsl(43_96%_80%_/_0.16)]",
              "transition-all duration-200 hover:border-amber-300/55 hover:shadow-[inset_0_1px_0_0_hsl(43_96%_80%_/_0.28),0_8px_24px_-12px_hsl(43_96%_56%_/_0.5)]",
              "disabled:pointer-events-none disabled:opacity-60",
            )}
          >
            <span className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-300/15 text-amber-300">
                <Zap className="size-4 fill-current" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold leading-tight">Hızlı oyu aç</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  Günlük abonelik — bekleme süresi{" "}
                  <s className="opacity-60">1 dk</s> → <strong className="text-amber-300">15 sn</strong>
                </span>
              </span>
              {hizliBusy && <Loader2 className="size-4 animate-spin" />}
            </span>
          </button>
        ))}

      {/* Kulüp başkanlığı — devralma her takım satırındaki düğmeden yapılır;
          seçili takımın başkanı günde 60 oy ekler */}
      {selected && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <div className="flex items-center gap-2">
            <Crown className="size-4 text-primary" />
            <h4 className="font-display text-sm font-bold">Kulüp başkanlığı</h4>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {teamName(selected)} kulübünün {provinceName} başkanı ol; her gün kulübüne 60 oy
            ekle. Devralma düğmesi her takımın yanında durur — boş koltuk {formatUsd(1)}'dan
            başlar, dolu koltuğu üstüne çıkarak devral.
          </p>
          <div className="mt-3">
            <Button
              className="w-full"
              variant="secondary"
              disabled={dailyBusy || !selectedSeat}
              onClick={() => void daily()}
            >
              {dailyBusy ? <Loader2 className="animate-spin" /> : <Vote className="size-4" />}
              Günde 60 oy ekle
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
