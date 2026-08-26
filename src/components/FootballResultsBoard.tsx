import type { ProvinceStanding } from "@/backend/types";
import { teamColor, teamName } from "@/data/footballTeams";
import { formatNumber, formatPercent } from "@/lib/game";
import { cn } from "@/lib/utils";

export function FootballResultsBoard({
  standing,
  max = 8,
  className,
}: {
  standing: ProvinceStanding;
  max?: number;
  className?: string;
}) {
  if (standing.totalVotes === 0) {
    return (
      <div className={cn("rounded-xl border border-dashed border-white/12 p-6 text-center", className)}>
        <p className="text-sm text-muted-foreground">
          Bu ilde henüz oy kullanılmadı. İlk oyu sen kullan.
        </p>
      </div>
    );
  }

  const shown = standing.tallies.slice(0, max);
  const rest = standing.tallies.slice(max);
  const restVotes = rest.reduce((sum, row) => sum + row.votes, 0);
  const restPct = rest.reduce((sum, row) => sum + row.pct, 0);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex h-9 w-full overflow-hidden rounded-lg ring-1 ring-white/10">
        {standing.tallies.map((row) => (
          <div
            key={row.partyId}
            className="grid place-items-center overflow-hidden text-[10px] font-bold text-white transition-[width] duration-500"
            style={{ width: `${row.pct}%`, background: teamColor(row.partyId) }}
            title={`${teamName(row.partyId)} ${formatPercent(row.pct)}`}
          >
            {row.pct >= 7 && <span className="px-1">{formatPercent(row.pct, 0)}</span>}
          </div>
        ))}
      </div>

      <ul className="space-y-1.5">
        {shown.map((row, index) => (
          <li key={row.partyId} className="flex items-center gap-3">
            <span
              className={cn(
                "w-4 text-right font-mono text-[11px]",
                index === 0 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <span className="size-3 shrink-0 rounded-[4px]" style={{ background: teamColor(row.partyId) }} />
            <span className={cn("min-w-0 flex-1 truncate text-sm", index === 0 && "font-semibold")}>{teamName(row.partyId)}</span>
            <span className="font-mono text-xs text-muted-foreground">{formatNumber(row.votes)}</span>
            <span className="w-14 text-right font-mono text-sm font-semibold tabular-nums">
              {formatPercent(row.pct)}
            </span>
          </li>
        ))}
        {rest.length > 0 && (
          <li className="flex items-center gap-3 pt-1 text-muted-foreground">
            <span className="w-4" />
            <span className="size-3 shrink-0 rounded-[4px] bg-white/15" />
            <span className="min-w-0 flex-1 truncate text-sm">Diğer ({rest.length} takım)</span>
            <span className="font-mono text-xs">{formatNumber(restVotes)}</span>
            <span className="w-14 text-right font-mono text-sm">{formatPercent(restPct)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
