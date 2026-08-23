import { Link } from "react-router-dom";
import { Flame, TrendingUp } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { PARTY_BY_ID, partyColor, partyTextColor } from "@/data/parties";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPercent } from "@/lib/game";
import { useMemo } from "react";

/** Ülke geneli tablo: parti yüzdeleri, kazanılan il sayısı ve en çekişmeli iller. */
export function NationalPanel({ onSelectProvince }: { onSelectProvince?: (id: string) => void }) {
  const { national, totalVotes, standings, loading } = useGame();

  const tightRaces = useMemo(
    () =>
      PROVINCES.map((p) => standings[p.id])
        .filter((s) => s && s.totalVotes > 30 && s.tallies.length > 1)
        .sort((a, b) => a.margin - b.margin)
        .slice(0, 6),
    [standings],
  );

  if (loading && national.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-display text-base font-bold">Türkiye geneli</h3>
          <span className="font-mono text-xs text-muted-foreground">
            {formatNumber(totalVotes)} oy
          </span>
        </div>

        <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full ring-1 ring-white/10">
          {national.map((row) => (
            <div
              key={row.partyId}
              style={{ width: `${row.pct}%`, background: partyColor(row.partyId) }}
              title={`${PARTY_BY_ID[row.partyId]?.name} ${formatPercent(row.pct)}`}
            />
          ))}
        </div>

        <ul className="space-y-1.5">
          {national.slice(0, 7).map((row) => (
            <li key={row.partyId} className="flex items-center gap-2.5">
              <span
                className="grid size-6 shrink-0 place-items-center rounded-md text-[9px] font-black"
                style={{ background: partyColor(row.partyId), color: partyTextColor(row.partyId) }}
              >
                {PARTY_BY_ID[row.partyId]?.name.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {PARTY_BY_ID[row.partyId]?.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {row.provinces} il
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-sm font-bold tabular-nums">
                {formatPercent(row.pct)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {tightRaces.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 font-display text-base font-bold">
            <Flame className="size-4 text-amber-400" />
            Çekişmeli iller
          </h3>
          <ul className="space-y-1">
            {tightRaces.map((standing) => {
              const province = PROVINCE_BY_ID[standing.provinceId];
              const [first, second] = standing.tallies;
              return (
                <li key={standing.provinceId}>
                  <button
                    type="button"
                    onClick={() => onSelectProvince?.(standing.provinceId)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {province?.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: partyColor(first.partyId) }}
                      />
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: partyColor(second.partyId) }}
                      />
                    </span>
                    <span className="w-12 text-right font-mono text-xs text-amber-300">
                      {formatPercent(standing.margin)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Link
        to="/siralama"
        className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <TrendingUp className="size-4" />
        Oyuncu sıralamasına bak
      </Link>
    </div>
  );
}
