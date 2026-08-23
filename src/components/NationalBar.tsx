import { useMemo } from "react";
import { useGame } from "@/backend/GameProvider";
import { PARTY_BY_ID, partyColor, partyShortName } from "@/data/parties";
import { formatNumber, formatPercent } from "@/lib/game";
import { cn } from "@/lib/utils";

/**
 * Türkiye geneli oy dağılımı — başlığın içinde, sayfanın en üstünde.
 *
 * Oyunun anlık durumu buydu ama sol sütunda, katlamanın altında duruyordu.
 * Artık her sayfada, her zaman görünür: seçim gecesi ekranlarındaki gibi tek
 * bir şerit ve önde gelen partilerin yüzdeleri.
 *
 * Dar ekranda yalnızca ilk üç parti yazıyla veriliyor; şerit yine tam
 * dağılımı gösteriyor, çünkü asıl bilgi orada.
 */
export function NationalBar({
  className,
  showTotal = true,
}: {
  className?: string;
  /** Başlıkta yer dar; toplam oy orada gizlenir, yüzdeler öncelikli. */
  showTotal?: boolean;
}) {
  const { national, totalVotes } = useGame();

  const rows = useMemo(() => national.filter((row) => row.pct > 0), [national]);

  if (rows.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-[11px] text-muted-foreground", className)}>
        Henüz oy yok — ilk oyu sen ver.
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex h-2 w-full overflow-hidden rounded-full ring-1 ring-white/10">
        {rows.map((row) => (
          <div
            key={row.partyId}
            style={{ width: `${row.pct}%`, background: partyColor(row.partyId) }}
            title={`${PARTY_BY_ID[row.partyId]?.name ?? row.partyId} ${formatPercent(row.pct)}`}
          />
        ))}
      </div>

      <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 overflow-hidden">
        {rows.slice(0, 6).map((row, index) => (
          <span
            key={row.partyId}
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-[11px] leading-none",
              // Dar ekranda ilk üçten sonrası gizlenir; şerit zaten hepsini gösteriyor.
              index >= 3 && "hidden md:flex",
              index >= 5 && "hidden xl:flex",
            )}
          >
            <span
              className="size-2 shrink-0 rounded-[3px]"
              style={{ background: partyColor(row.partyId) }}
            />
            <span className="font-semibold text-foreground/85">{partyShortName(row.partyId)}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatPercent(row.pct)}
            </span>
          </span>
        ))}
        {showTotal && (
          <span className="ml-auto hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground sm:block">
            {formatNumber(totalVotes)} oy
          </span>
        )}
      </div>
    </div>
  );
}
