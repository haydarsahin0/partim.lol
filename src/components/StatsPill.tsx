import { useEffect, useRef, useState } from "react";
import { useGame } from "@/backend/GameProvider";
import { formatNumber } from "@/lib/game";
import { cn } from "@/lib/utils";

/**
 * Sayıyı hedefe doğru yumuşakça sayar. Sayaç her tazelendiğinde değerin
 * zıplaması yerine akması, hapın "canlı" hissini veren asıl ayrıntı.
 */
function useCountUp(value: number, duration = 700) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    // Başlangıcı ilk karenin zaman damgasından alıyoruz: bazı tarayıcılarda
    // requestAnimationFrame'in zaman kaynağı performance.now() ile aynı
    // değil ve fark, ilerlemeyi negatife düşürüp sayacı eksi gösteriyordu.
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      // easeOutCubic
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (value - from) * eased);
      setShown(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return shown;
}

/** Üstte duran canlı kullanıcı / toplam ziyaretçi hapı. */
export function StatsPill({ className }: { className?: string }) {
  const { stats } = useGame();
  const online = useCountUp(stats.online);
  const total = useCountUp(stats.total);

  if (!stats.total && !stats.online) return null;

  return (
    <div
      className={cn(
        "glass-pill mx-auto flex w-fit max-w-full items-center gap-2 px-4 py-2 text-[13px] sm:gap-2.5 sm:text-sm",
        className,
      )}
    >
      <span className="live-dot" aria-hidden="true" />
      <span className="font-semibold tabular-nums text-emerald-300">
        {formatNumber(online)} <span className="text-foreground/85">çevrimiçi</span>
      </span>
      <span aria-hidden="true" className="text-muted-foreground/50">
        ·
      </span>
      <span className="truncate tabular-nums text-muted-foreground">
        <span className="font-semibold text-foreground/85">{formatNumber(total)}</span> oyuncu
      </span>
    </div>
  );
}
