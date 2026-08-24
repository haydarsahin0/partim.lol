/**
 * Miting: il başkanının günde bir kez partisine o ilde toplu oy eklemesi.
 *
 * NEDEN VAR
 *
 * İl başkanlığı parayla alınıyordu ama haritaya hiç dokunmuyordu — ödeme yapan
 * kişi karşılığında oyunun içinde bir güç almıyordu. Miting koltuğu haritanın
 * koluna çeviriyor: bir ilde bir partinin mitingini yalnızca başkanı
 * düzenleyebilir. Koltuğun satın alma sebebi bu.
 *
 * İki görünüm var: ilin sonuç sekmesinin en üstünde duran geniş kart
 * (RallyCallout) ve başkanlar listesindeki dar düğme (RallyButton).
 */
import { useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import { PARTY_BY_ID, partyColor, partyTextColor } from "@/data/parties";
import { RALLY_VOTES, formatDuration, formatNumber } from "@/lib/game";
import type { LeaderSeat } from "@/backend/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Bu ilde kullanıcının başkanı olduğu koltuklar. */
export function myRallySeats(seats: LeaderSeat[] | null, userId: string | undefined): LeaderSeat[] {
  if (!seats || !userId) return [];
  return seats.filter((seat) => seat.holder?.id === userId);
}

function useRally(seat: LeaderSeat, onDone?: () => void) {
  const { holdRally } = useGame();
  const [busy, setBusy] = useState(false);
  const kalan = useCountdown(seat.nextRallyAt);
  const hazir = kalan <= 0;

  const duzenle = async () => {
    setBusy(true);
    try {
      const ok = await holdRally(seat.provinceId, seat.partyId);
      if (ok) onDone?.();
    } finally {
      setBusy(false);
    }
  };

  return { busy, kalan, hazir, duzenle };
}

/** Başkanlar listesindeki dar miting düğmesi. */
export function RallyButton({ seat, onDone }: { seat: LeaderSeat; onDone?: () => void }) {
  const { busy, kalan, hazir, duzenle } = useRally(seat, onDone);

  return (
    <Button
      size="sm"
      variant={hazir ? "primary" : "outline"}
      disabled={!hazir || busy}
      onClick={() => void duzenle()}
      title={
        hazir
          ? `Partine ${RALLY_VOTES} oy ekle`
          : "Miting hakkın günde bir kez yenilenir"
      }
    >
      {busy ? <Loader2 className="animate-spin" /> : <Megaphone />}
      {hazir ? "Miting yap" : formatDuration(kalan)}
    </Button>
  );
}

/**
 * İlin sonuç sekmesinin en üstünde duran geniş kart.
 *
 * Başkan sayfayı açar açmaz elindeki gücü görsün diye oy oranlarının da
 * üstünde duruyor: mitingin bütün değeri "bugün kullandın mı" sorusunda.
 */
export function RallyCallout({
  seats,
  provinceName,
  onDone,
}: {
  seats: LeaderSeat[];
  provinceName: string;
  onDone?: () => void;
}) {
  if (seats.length === 0) return null;
  return (
    <div className="space-y-2">
      {seats.map((seat) => (
        <RallyCard key={`${seat.provinceId}-${seat.partyId}`} seat={seat} provinceName={provinceName} onDone={onDone} />
      ))}
    </div>
  );
}

function RallyCard({
  seat,
  provinceName,
  onDone,
}: {
  seat: LeaderSeat;
  provinceName: string;
  onDone?: () => void;
}) {
  const { busy, kalan, hazir, duzenle } = useRally(seat, onDone);
  const renk = partyColor(seat.partyId);
  const parti = PARTY_BY_ID[seat.partyId]?.name ?? seat.partyId;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4",
        hazir ? "border-white/25 bg-white/[0.06]" : "border-white/10 bg-white/[0.02]",
      )}
      style={hazir ? { borderColor: `${renk}66`, background: `${renk}14` } : undefined}
    >
      <div className="flex items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl"
          style={{ background: renk, color: partyTextColor(seat.partyId) }}
        >
          <Megaphone className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-bold">
            {provinceName} {parti} il başkanısın
          </div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            {hazir ? (
              <>
                Bugünkü mitingin hazır: {parti}&apos;ye {provinceName}&apos;da{" "}
                <strong className="text-foreground">{formatNumber(RALLY_VOTES)} oy</strong> ekler.
              </>
            ) : (
              <>Bugünkü mitingini yaptın. Yeni hakkın {formatDuration(kalan)} sonra açılır.</>
            )}
          </div>
        </div>

        <Button
          className="shrink-0"
          variant={hazir ? "primary" : "default"}
          disabled={!hazir || busy}
          onClick={() => void duzenle()}
          style={hazir ? { background: renk, color: partyTextColor(seat.partyId) } : undefined}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Megaphone />}
          {hazir ? "Miting yap" : formatDuration(kalan)}
        </Button>
      </div>
    </div>
  );
}
