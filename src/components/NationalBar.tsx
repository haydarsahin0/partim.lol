import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/backend/GameProvider";
import { PARTY_BY_ID, partyColor, partyShortName } from "@/data/parties";
import { formatNumber, formatPercent } from "@/lib/game";
import { cn } from "@/lib/utils";

/**
 * Türkiye geneli oy dağılımı — başlığın içinde, sayfanın en üstünde.
 *
 * Şerit her zaman bütün partileri gösterir. Altındaki liste ise YATAY
 * KAYDIRILIR: 17 parti hiçbir ekrana yan yana sığmıyor, ilk altısını gösterip
 * gerisini kesmek de "detayı göremiyorum" demek. Kaydırma çubuğu ince, iki
 * yana da soluk geçiş konuyor ki devamı olduğu belli olsun.
 *
 * Her satırda kısaltma, yüzde ve oy sayısı var; sıra numarası da yazılı,
 * çünkü kaydırınca kaçıncı partiye baktığın kayboluyor.
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

  /*
   * Kaydırma kenarları.
   *
   * Sabit bir sağ gölge koymak yanlış bilgi veriyordu: liste sonuna kadar
   * kaydırıldığında da "devamı var" der gibi duruyordu. Gölgeler artık
   * gerçekten kaydırılabilecek yöne göre çiziliyor ve arka planı boyamak
   * yerine içeriği maskeliyor — böylece camın rengi ne olursa olsun uyuyor.
   */
  const listRef = useRef<HTMLUListElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 4, end: max > 4 && el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, rows.length]);

  const FADE = 22;
  const maskImage = useMemo(() => {
    if (!edges.start && !edges.end) return undefined;
    const from = edges.start ? `transparent 0, #000 ${FADE}px` : "#000 0";
    const to = edges.end ? `#000 calc(100% - ${FADE}px), transparent 100%` : "#000 100%";
    return `linear-gradient(90deg, ${from}, ${to})`;
  }, [edges.start, edges.end]);

  if (rows.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-[11px] text-muted-foreground", className)}>
        Henüz oy yok — ilk oyu sen ver.
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-2">
        <div className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full ring-1 ring-white/10">
          {rows.map((row) => (
            <div
              key={row.partyId}
              style={{ width: `${row.pct}%`, background: partyColor(row.partyId) }}
              title={`${PARTY_BY_ID[row.partyId]?.name ?? row.partyId} ${formatPercent(row.pct)}`}
            />
          ))}
        </div>
        {showTotal && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatNumber(totalVotes)} oy
          </span>
        )}
      </div>

      <div className="relative mt-1.5">
        <ul
          ref={listRef}
          onScroll={measure}
          style={{ maskImage, WebkitMaskImage: maskImage }}
          className="thin-scroll flex snap-x gap-3 overflow-x-auto pb-0.5"
          aria-label="Türkiye geneli parti sıralaması"
        >
          {rows.map((row, index) => (
            <li
              key={row.partyId}
              className="flex shrink-0 snap-start items-center gap-1.5 text-[11px] leading-none"
              title={`${PARTY_BY_ID[row.partyId]?.name ?? row.partyId} · ${formatNumber(row.votes)} oy`}
            >
              <span className="font-mono tabular-nums text-muted-foreground/60">{index + 1}</span>
              <span
                className="size-2 shrink-0 rounded-[3px]"
                style={{ background: partyColor(row.partyId) }}
              />
              <span className="font-semibold text-foreground/85">{partyShortName(row.partyId)}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {formatPercent(row.pct)}
              </span>
              <span className="font-mono tabular-nums text-muted-foreground/50">
                {formatNumber(row.votes)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
