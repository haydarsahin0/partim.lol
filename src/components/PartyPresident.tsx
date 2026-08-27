import { useState, type CSSProperties } from "react";
import { Crown, Loader2, Sparkles } from "lucide-react";
import type { LeaderSeat } from "@/backend/types";
import { LEADER_BASE_PRICE, formatUsd } from "@/lib/game";
import { cn } from "@/lib/utils";

/**
 * Partinin o ildeki başkanı + il başkanı ol/devral düğmesi.
 *
 * Sonuçlar listesindeki her partinin yanında durur: koltuk doluysa başkanın
 * kullanıcı adı ve "Başkanlığı devral" düğmesi, boşsa "başkan yok" ve parti
 * rengiyle parlayan "İl başkanı ol" düğmesi. Düğme Stripe Checkout'a
 * yönlendirir (demo modda anında devreder). Görünüm ve animasyonlar futbol
 * haritasındaki başkan rozetiyle aynı (president-* CSS kuralları).
 */
export function PartyPresident({
  seat,
  onClaim,
  tint,
  stacked = false,
  className,
}: {
  /** Bu ildeki parti koltuğu; yoksa başkan yok demektir */
  seat: LeaderSeat | null | undefined;
  /** Giriş denetimi ve Stripe'a yönlendirmeyi üst bileşen yapar */
  onClaim: (provinceId: string, partyId: string) => Promise<boolean>;
  /** Parti rengi — boş koltuğu davetkâr gösterir */
  tint?: string;
  /** Dar hücrelerde rozet ve düğme alt alta dizilir */
  stacked?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const holder = seat?.holder ?? null;
  const price = seat?.nextPrice ?? LEADER_BASE_PRICE;
  const canClaim = Boolean(seat?.provinceId && seat?.partyId);

  const claim = async () => {
    if (!canClaim || busy || !seat) return;
    setBusy(true);
    try {
      await onClaim(seat.provinceId, seat.partyId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5",
        stacked && "flex-col items-end gap-1",
        className,
      )}
      style={{ "--tint": tint ?? "#B96FFF" } as CSSProperties}
    >
      <span
        className={cn(
          "president-chip inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-[3px]",
          holder
            ? "bg-amber-300/[0.1] text-amber-200/90"
            : "bg-white/[0.04] text-muted-foreground/70",
        )}
        title={holder ? `${holder.displayName} — il başkanı` : "Bu partinin bu ilde başkanı yok"}
      >
        <Crown
          className={cn(
            "size-2.5 shrink-0",
            holder ? "president-crown text-amber-300" : "opacity-50",
          )}
        />
        <span className="max-w-[8.5rem] truncate text-[9.5px] font-bold leading-none">
          {holder ? `@${holder.handle}` : "başkan yok"}
        </span>
      </span>

      <button
        type="button"
        onClick={() => void claim()}
        disabled={!canClaim || busy}
        aria-label={
          holder
            ? `${holder.handle} başkanlığını ${formatUsd(price)} karşılığı devral`
            : `İl başkanı ol (${formatUsd(price)}'dan başlar)`
        }
        className={cn(
          "president-claim inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-bold leading-none transition-all duration-200",
          "active:scale-95 disabled:pointer-events-none disabled:opacity-40",
          holder
            ? "border-white/20 bg-white/[0.06] text-foreground hover:border-white/45 hover:bg-white/[0.12]"
            : "president-claim--invite border-white/20 bg-white/[0.06] text-foreground",
        )}
      >
        {busy ? (
          <Loader2 className="size-2.5 animate-spin" />
        ) : holder ? (
          <Crown className="size-2.5 text-amber-300" />
        ) : (
          <Sparkles className="size-2.5" style={{ color: tint }} />
        )}
        <span>{holder ? "Başkanlığı devral" : "İl başkanı ol"}</span>
        <span className="font-mono text-[8.5px] opacity-75">{formatUsd(price)}</span>
      </button>
    </span>
  );
}
