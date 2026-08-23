import { PARTY_BY_ID, partyColor, partyTextColor } from "@/data/parties";
import type { ProvinceStanding } from "@/backend/types";
import { formatNumber, formatPercent } from "@/lib/game";
import { cn } from "@/lib/utils";

/**
 * Seçim gecesi tarzı sonuç tablosu: üstte tek parça yüzde şeridi,
 * altta parti parti dökümü.
 */
export function ResultsBoard({
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
          Bu ilde henüz oy kullanılmadı. İlk oyu sen kullan, ili boya.
        </p>
      </div>
    );
  }

  const shown = standing.tallies.slice(0, max);
  const rest = standing.tallies.slice(max);
  const restVotes = rest.reduce((a, t) => a + t.votes, 0);
  const restPct = rest.reduce((a, t) => a + t.pct, 0);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Yüzde şeridi */}
      <div className="flex h-9 w-full overflow-hidden rounded-lg ring-1 ring-white/10">
        {standing.tallies.map((tally) => (
          <div
            key={tally.partyId}
            className="grid place-items-center overflow-hidden text-[10px] font-bold transition-[width] duration-500"
            style={{
              width: `${tally.pct}%`,
              background: partyColor(tally.partyId),
              color: partyTextColor(tally.partyId),
            }}
            title={`${PARTY_BY_ID[tally.partyId]?.name ?? tally.partyId} ${formatPercent(tally.pct)}`}
          >
            {tally.pct >= 7 && <span className="px-1">{formatPercent(tally.pct, 0)}</span>}
          </div>
        ))}
      </div>

      {/* Parti dökümü */}
      <ul className="space-y-1.5">
        {shown.map((tally, index) => {
          const party = PARTY_BY_ID[tally.partyId];
          return (
            <li key={tally.partyId} className="flex items-center gap-3">
              <span
                className={cn(
                  "w-4 text-right font-mono text-[11px]",
                  index === 0 ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span
                className="size-3 shrink-0 rounded-[4px]"
                style={{ background: partyColor(tally.partyId) }}
              />
              <span
                className={cn("min-w-0 flex-1 truncate text-sm", index === 0 && "font-semibold")}
                title={party?.fullName}
              >
                {party?.name ?? tally.partyId}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {formatNumber(tally.votes)}
              </span>
              <span className="w-14 text-right font-mono text-sm font-semibold tabular-nums">
                {formatPercent(tally.pct)}
              </span>
            </li>
          );
        })}
        {rest.length > 0 && (
          <li className="flex items-center gap-3 pt-1 text-muted-foreground">
            <span className="w-4" />
            <span className="size-3 shrink-0 rounded-[4px] bg-white/15" />
            <span className="min-w-0 flex-1 truncate text-sm">Diğer ({rest.length} parti)</span>
            <span className="font-mono text-xs">{formatNumber(restVotes)}</span>
            <span className="w-14 text-right font-mono text-sm">{formatPercent(restPct)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
