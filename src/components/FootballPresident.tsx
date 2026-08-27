import { useState, type CSSProperties } from "react";
import { Crown, Loader2, Sparkles } from "lucide-react";
import type { FootballSeat } from "@/backend/types";
import { formatUsd } from "@/lib/game";
import { cn } from "@/lib/utils";

/**
 * Takımın o ildeki başkanı + devral/başkan ol düğmesi.
 *
 * Hem oy pusulasındaki her takım satırının yanında hem maç gecesi listesinde
 * kullanılır: koltuk doluysa başkanın kullanıcı adı ve "Devral" düğmesi,
 * boşsa "Başkan yok" ve takım rengiyle yumuşakça parlayan "Başkan ol"
 * düğmesi görünür. Animasyonlar index.css'teki president-* kurallarında.
 */
export function FootballPresident({
  provinceId,
  clubId,
  seat,
  onClaimSeat,
  tint,
  stacked = false,
  className,
}: {
  /** Devralma/başkan olma ilçesi — boş koltukta yeni koltuk burada açılır */
  provinceId: string;
  /** Kulüp kimliği */
  clubId: string;
  /** Bu ildeki mevcut koltuk satırı; yoksa başkan yok demektir */
  seat?: FootballSeat | null;
  onClaimSeat: (provinceId: string, clubId: string) => Promise<boolean>;
  /** Takım rengi — boş koltuğu davetkâr gösterir */
  tint?: string;
  /** Dar hücrelerde (pusula) rozet ve düğme alt alta dizilir */
  stacked?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const holder = seat?.holder ?? null;
  const price = seat?.nextPrice ?? 1;
  // Kullanıcı kulüplerinin memleketi yoktur: o zaman sahip oldukları koltuğu
  // devralma hedefi sayılır (seat zaten verilir, provinceId boş gelir).
  const claimProvince = provinceId || seat?.provinceId || "";
  const claimClub = clubId || seat?.clubId || "";
  const canClaim = Boolean(claimProvince && claimClub);

  const claim = async () => {
    if (!canClaim || busy) return;
    setBusy(true);
    try {
      await onClaimSeat(claimProvince, claimClub);
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
        title={holder ? `${holder.displayName} — kulüp başkanı` : "Bu kulübün bu ilde başkanı yok"}
      >
        <Crown
          className={cn(
            "size-2.5 shrink-0",
            holder ? "president-crown text-amber-300" : "opacity-50",
          )}
        />
        <span className="max-w-[8.5rem] truncate text-[9.5px] font-bold leading-none">
          {holder ? `@${holder.handle}` : "Başkan yok"}
        </span>
      </span>

      <button
        type="button"
        onClick={() => void claim()}
        disabled={!canClaim || busy}
        aria-label={
          holder
            ? `${holder.handle} başkanlığını ${formatUsd(price)} karşılığı devral`
            : `Başkan ol (${formatUsd(price)}'dan başlar)`
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
        <span>{holder ? "Devral" : "Başkan ol"}</span>
        <span className="font-mono text-[8.5px] opacity-75">{formatUsd(price)}</span>
      </button>
    </span>
  );
}
