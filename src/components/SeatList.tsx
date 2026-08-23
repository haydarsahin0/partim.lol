import { useState } from "react";
import { Crown, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { PARTY_BY_ID, partyColor, partyTextColor } from "@/data/parties";
import { useGame } from "@/backend/GameProvider";
import type { LeaderSeat } from "@/backend/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignInDialog } from "@/components/SignInDialog";
import { XP_PER_LEADER_HOUR, formatSince, formatUsd } from "@/lib/game";
import { cn } from "@/lib/utils";

/** Bir ildeki tüm partilerin il başkanlığı koltukları. */
export function SeatList({
  provinceName,
  seats,
  onChanged,
}: {
  provinceName: string;
  seats: LeaderSeat[];
  onChanged?: () => void;
}) {
  const { user, isDemo, claimSeat } = useGame();
  const [target, setTarget] = useState<LeaderSeat | null>(null);
  const [busy, setBusy] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const seat = await claimSeat(target.provinceId, target.partyId);
      if (seat) {
        setTarget(null);
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  // Dolu koltuklar önce, sonra boşlar; her grup fiyata göre
  const ordered = [...seats].sort((a, b) => {
    if (!!a.holder !== !!b.holder) return a.holder ? -1 : 1;
    return b.price - a.price;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold">İl başkanlıkları</h3>
        <span className="text-xs text-muted-foreground">
          Saat başı +{XP_PER_LEADER_HOUR} XP · devralma her elde {formatUsd(1)} artar
        </span>
      </div>

      <ul className="space-y-1.5">
        {ordered.map((seat) => {
          const party = PARTY_BY_ID[seat.partyId];
          const mine = !!user && seat.holder?.id === user.id;
          return (
            <li
              key={seat.partyId}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                mine
                  ? "border-primary/40 bg-primary/[0.08]"
                  : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]",
              )}
            >
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-black"
                style={{ background: partyColor(seat.partyId), color: partyTextColor(seat.partyId) }}
                title={party?.fullName}
              >
                {party?.name.slice(0, 2) ?? "?"}
              </span>

              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-muted-foreground">
                  {party?.name ?? seat.partyId}
                </div>
                {seat.holder ? (
                  <div className="flex items-center gap-1.5">
                    <Avatar src={seat.holder.avatarUrl} handle={seat.holder.handle} size={18} />
                    <span className="truncate text-sm font-semibold">@{seat.holder.handle}</span>
                    {mine && (
                      <Badge variant="default" className="px-1.5 py-0">
                        sen
                      </Badge>
                    )}
                    {seat.heldSince && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatSince(seat.heldSince)}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-muted-foreground">Koltuk boş</div>
                )}
              </div>

              <div className="shrink-0 text-right">
                {mine ? (
                  <Badge variant="success" className="gap-1">
                    <Crown className="size-3" /> başkansın
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant={seat.holder ? "outline" : "default"}
                    onClick={() => (user ? setTarget(seat) : setSignInOpen(true))}
                  >
                    {seat.holder ? "Devral" : "Kap"} {formatUsd(seat.nextPrice)}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="max-w-md">
          {target && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {provinceName} · {PARTY_BY_ID[target.partyId]?.name} il başkanlığı
                </DialogTitle>
                <DialogDescription>
                  {target.holder
                    ? `Koltuk şu an @${target.holder.handle} elinde. ${formatUsd(
                        target.nextPrice,
                      )} ödeyerek devralabilirsin.`
                    : `Bu koltuk boş. ${formatUsd(target.nextPrice)} ödeyerek ilk başkan sen ol.`}
                </DialogDescription>
              </DialogHeader>

              <ul className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <li className="flex items-center gap-2">
                  <Crown className="size-4 text-primary" />
                  Adın bu ilde partinin yanında görünür.
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  Koltuğu elinde tuttuğun her saat +{XP_PER_LEADER_HOUR} XP.
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  Bir sonraki devralma bedeli {formatUsd(target.nextPrice + 1)} olur.
                </li>
              </ul>

              {isDemo && (
                <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
                  Demo modda gerçek ödeme alınmaz; koltuk anında sana geçer. Gerçek kurulumda bu düğme
                  Stripe Checkout'a yönlendirir.
                </p>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setTarget(null)}>
                  Vazgeç
                </Button>
                <Button onClick={() => void confirm()} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Crown />}
                  {formatUsd(target.nextPrice)} öde
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </div>
  );
}
