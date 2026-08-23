import { useEffect, useRef, useState } from "react";

/**
 * Sayıyı eski değerinden yenisine doğru sayarak gösterir.
 *
 * Seçim gecesi ekranlarının hissi büyük ölçüde buradan geliyor: rakam yerine
 * oturmuyor, yerine doğru koşuyor. Oy geldikçe güncellenen her sayaçta
 * kullanılıyor.
 */
export function useCountUp(value: number, duration = 700) {
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
