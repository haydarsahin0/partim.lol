import { useEffect, useState } from "react";

/** Verilen ISO ana kalan süreyi saniyede bir tazeler. */
export function useCountdown(targetIso: string | null | undefined): number {
  const target = targetIso ? Date.parse(targetIso) : 0;
  const [remaining, setRemaining] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    if (!target || target <= Date.now()) {
      setRemaining(0);
      return;
    }
    setRemaining(Math.max(0, target - Date.now()));
    const id = window.setInterval(() => {
      const next = Math.max(0, target - Date.now());
      setRemaining(next);
      if (next === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  return remaining;
}
