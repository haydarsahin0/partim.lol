import { useMemo, useState } from "react";
import { Check, Loader2, Search, Vote } from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";
import { FOOTBALL_TEAMS, teamColor, teamName, type FootballTeam } from "@/data/footballTeams";
import { formatDuration } from "@/lib/game";
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
}: {
  provinceId: string;
  provinceName: string;
  nextVoteAt: string | null;
  onVote: (provinceId: string, teamId: string) => Promise<boolean> | boolean;
  ballotTeams?: FootballTeam[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    </div>
  );
}
