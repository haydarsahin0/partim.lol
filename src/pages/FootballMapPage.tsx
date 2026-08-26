import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { TurkeyMap, focusProvinceOnMap } from "@/components/TurkeyMap";
import { FootballProvinceDialog } from "@/components/FootballProvinceDialog";
import { FootballProvinceSearch } from "@/components/FootballProvinceSearch";
import {
  FOOTBALL_NEUTRAL_COLOR,
  FOOTBALL_TEAMS,
  teamColor,
  teamName,
} from "@/data/footballTeams";
import { useFootballMapGame } from "@/hooks/useFootballMapGame";
import { Card } from "@/components/ui/card";

export default function FootballMapPage() {
  const [params, setParams] = useSearchParams();
  const selectedProvinceId = params.get("il");
  const { standings, nextVoteAt, vote } = useFootballMapGame();

  const select = (provinceId: string) => {
    setParams(provinceId ? { il: provinceId } : {}, { replace: true });
  };

  const selectAndFocus = (provinceId: string) => {
    select(provinceId);
    focusProvinceOnMap(provinceId);
  };

  const leadingTeams = useMemo(() => {
    const counters: Record<string, number> = {};
    for (const standing of Object.values(standings)) {
      if (!standing.leadingPartyId) continue;
      counters[standing.leadingPartyId] = (counters[standing.leadingPartyId] ?? 0) + 1;
    }
    return Object.entries(counters)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [standings]);

  const selectedStanding = selectedProvinceId ? standings[selectedProvinceId] ?? null : null;

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <h1 className="font-display text-xl font-bold tracking-[-0.02em]">Futbol Haritası</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ana haritadaki mantığın aynısıyla çalışır; bu kez partiler yerine şehir takımları yarışır.
            </p>
          </div>

          <FootballProvinceSearch standings={standings} onPick={selectAndFocus} />

          <div className="glass-flat relative min-h-[34vh] flex-1 overflow-hidden lg:aspect-[2.05/1] lg:min-h-0 lg:flex-none">
            <TurkeyMap
              standings={standings}
              selectedId={selectedProvinceId}
              onSelect={select}
              entityColor={teamColor}
              entityName={teamName}
              neutralColor={FOOTBALL_NEUTRAL_COLOR}
            />
          </div>
        </section>

        <aside>
          <Card className="space-y-3 p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold tracking-[-0.02em]">
              <Trophy className="size-4" />
              Lider takımlar
            </h2>
            <p className="text-xs text-muted-foreground">Tüm şehir takımları: {FOOTBALL_TEAMS.length}</p>
            <ul className="space-y-2">
              {leadingTeams.length === 0 && (
                <li className="text-sm text-muted-foreground">Henüz oy yok. İlk oyu verip liderliği başlat.</li>
              )}
              {leadingTeams.map(([teamId, provinces], index) => (
                <li key={teamId} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-right font-mono text-xs text-muted-foreground">{index + 1}</span>
                  <span className="size-2.5 rounded-full" style={{ background: teamColor(teamId) }} />
                  <span className="flex-1 truncate font-semibold">{teamName(teamId)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{provinces} il</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      <FootballProvinceDialog
        provinceId={selectedProvinceId}
        standing={selectedStanding}
        nextVoteAt={nextVoteAt}
        onVote={async (provinceId, teamId) => vote(provinceId, teamId).ok}
        onClose={() => setParams({}, { replace: true })}
      />
    </div>
  );
}
