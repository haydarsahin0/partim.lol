import { useState } from "react";
import { Crown, Loader2, Megaphone, ShieldCheck, Sparkles } from "lucide-react";
import { PARTY_BY_ID } from "@/data/parties";
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
import {
  RALLY_VOTES,
  XP_PER_LEADER_HOUR,
  checkLeaderBid,
  formatNumber,
  formatSince,
  formatUsd,
} from "@/lib/game";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BotDot } from "@/components/BotDot";
import { PartyMark } from "@/components/PartyMark";
import { SeatCardButton } from "@/components/SeatCardButton";
import { RallyButton } from "@/components/Rally";

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
  const { user, isDemo, claimSeat, requireAuth } = useGame();
  const [target, setTarget] = useState<LeaderSeat | null>(null);
  const [busy, setBusy] = useState(false);
  /* Teklif metin olarak tutuluyor: sayıya çevirince kullanıcı "12" yazarken
     ara adımda "1" görünüp imleç zıplıyor. */
  const [teklif, setTeklif] = useState("");

  const tutar = Number(teklif.replace(",", "."));
  const kontrol = target ? checkLeaderBid(tutar, target.nextPrice) : { ok: false as const, message: "" };

  const ac = (seat: LeaderSeat) => {
    if (!requireAuth("Koltuğun sana geçebilmesi için önce giriş yap.")) return;
    setTarget(seat);
    setTeklif(String(seat.nextPrice));
  };

  const confirm = async () => {
    if (!target || !kontrol.ok) return;
    setBusy(true);
    try {
      const seat = await claimSeat(target.provinceId, target.partyId, tutar);
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
          Saat başı +{XP_PER_LEADER_HOUR} XP · devralmak için son bedelin üstüne çık
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
              <PartyMark partyId={seat.partyId} size={36} title={party?.fullName} />

              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-muted-foreground">
                  {party?.name ?? seat.partyId}
                </div>
                {seat.holder ? (
                  <div className="flex items-center gap-1.5">
                    <Avatar src={seat.holder.avatarUrl} handle={seat.holder.handle} size={18} />
                    <span className="truncate text-sm font-semibold">@{seat.holder.handle}</span>
                    {seat.holder.isBot && <BotDot />}
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
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge variant="success" className="gap-1">
                      <Crown className="size-3" /> başkansın
                    </Badge>
                    <RallyButton seat={seat} onDone={onChanged} />
                    <SeatCardButton seat={seat} />
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant={seat.holder ? "outline" : "default"}
                    onClick={() => ac(seat)}
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
                    ? `Koltuk şu an @${target.holder.handle} elinde. En az ${formatUsd(
                        target.nextPrice,
                      )} ödeyerek devralabilirsin — dilediğin kadar üstüne çıkabilirsin.`
                    : `Bu koltuk boş. En az ${formatUsd(target.nextPrice)} ödeyerek ilk başkan sen ol.`}
                </DialogDescription>
              </DialogHeader>

              {/* Ucu açık teklif: ödenen tutar koltuğun yeni değeri olur, yani
                  yüksek teklif hem koltuğu alır hem savunur. */}
              <div className="space-y-2">
                <label htmlFor="baskanlik-teklif" className="stat-label">
                  Ödeyeceğin tutar
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="baskanlik-teklif"
                      inputMode="decimal"
                      value={teklif}
                      onChange={(e) => setTeklif(e.target.value.replace(/[^\d.,]/g, ""))}
                      className="pl-7 font-mono"
                      aria-invalid={!kontrol.ok}
                    />
                  </div>
                  {[
                    { etiket: "en az", deger: target.nextPrice },
                    { etiket: "2×", deger: target.nextPrice * 2 },
                    { etiket: "5×", deger: target.nextPrice * 5 },
                  ].map((h) => (
                    <Button
                      key={h.etiket}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setTeklif(String(h.deger))}
                    >
                      {h.etiket}
                    </Button>
                  ))}
                </div>
                {!kontrol.ok && kontrol.message && (
                  <p className="text-xs text-amber-300">{kontrol.message}</p>
                )}
              </div>

              <ul className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                {/* Mitingi ilk sıraya koyduk: koltuğun asıl satın alma sebebi bu,
                    diğerleri yanında rozet kalıyor. */}
                <li className="flex items-start gap-2">
                  <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <strong className="text-foreground">Günde bir miting</strong> düzenler,{" "}
                    {PARTY_BY_ID[target.partyId]?.name}&apos;ye {provinceName}&apos;da{" "}
                    <strong className="text-foreground">{formatNumber(RALLY_VOTES)} oy</strong>{" "}
                    eklersin. Bu ilde bunu senden başkası yapamaz.
                  </span>
                </li>
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
                  Ödediğin tutar koltuğun yeni değeri olur; senden devralmak isteyen
                  en az {formatUsd((kontrol.ok ? tutar : target.nextPrice) + 1)} ödemek zorunda kalır.
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
                <Button onClick={() => void confirm()} disabled={busy || !kontrol.ok}>
                  {busy ? <Loader2 className="animate-spin" /> : <Crown />}
                  {kontrol.ok ? `${formatUsd(tutar)} öde` : "Tutarı gir"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
