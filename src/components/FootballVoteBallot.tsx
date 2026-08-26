import { useMemo, useState } from "react";
import { Check, Crown, Loader2, Search, Vote } from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";
import { FOOTBALL_TEAMS, teamColor, teamName, type FootballTeam } from "@/data/footballTeams";
import type { FootballSeat } from "@/backend/types";
import { formatDuration, formatUsd } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const cooldown = useCountdown(nextVoteAt);
  const locked = cooldown > 0;

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

  const claim = async () => {
    if (!selected || claimBusy) return;
    setClaimBusy(true);
    try {
      await onClaimSeat(provinceId, selected);
    } finally {
      setClaimBusy(false);
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
  const selectedSeatPrice = selectedSeat?.nextPrice ?? 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold">Takım pusulası</h3>
        <span className="text-xs text-muted-foreground">1 dakikada 1 oy</span>
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draft);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Takım ara (şehir veya takım adı)"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Ara
        </Button>
      </form>

      <div className="thin-scroll grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {filteredTeams.map((team) => {
          const isSelected = selected === team.id;
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => setSelected(isSelected ? null : team.id)}
              aria-pressed={isSelected}
              className={cn(
                "group relative flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all",
                isSelected
                  ? "border-white/40 bg-white/[0.09] shadow-lg"
                  : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.06]",
              )}
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
          );
        })}
      </div>

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

      {/* Kulüp başkanlığı — $1'den başlar, başkan günde 60 oy atar */}
      {selected && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <div className="flex items-center gap-2">
            <Crown className="size-4 text-primary" />
            <h4 className="font-display text-sm font-bold">Kulüp başkanlığı</h4>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {teamName(selected)} kulübünün {provinceName} başkanı ol; her gün kulübüne 60 oy
            ekle. Boş koltuk {formatUsd(1)}'dan başlar, dolu koltuğu üstüne çıkarak devral.
          </p>
          <div className="mt-3 space-y-2">
            <Button
              className="w-full"
              variant="outline"
              disabled={claimBusy}
              onClick={() => void claim()}
            >
              {claimBusy ? <Loader2 className="animate-spin" /> : <Crown className="size-4" />}
              {selectedSeat
                ? `Başkanlığı devral — ${formatUsd(selectedSeatPrice)}`
                : `Başkan ol — ${formatUsd(selectedSeatPrice)}`}
            </Button>
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
