import { useCallback, useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import type { LeaderSeat } from "@/backend/types";
import { KART_BOY, KART_EN, drawSeatCard } from "@/lib/seatCardRenderer";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { Button } from "@/components/ui/button";

/**
 * "Kartı paylaş" düğmesi.
 *
 * Koltuğu alan kişiye, paylaşabileceği bir görsel veriyor. Oyunun en ucuz
 * pazarlaması bu: başkan kartını kendi paylaşıyor, takipçileri oyunu görüyor.
 *
 * Telefonda `navigator.share` varsa doğrudan paylaşım penceresi açılıyor
 * (X, WhatsApp, Instagram hepsi orada); yoksa dosya indiriliyor.
 */
export function SeatCardButton({
  seat,
  className,
}: {
  seat: LeaderSeat;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const uret = useCallback(async () => {
    if (!seat.holder) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = KART_EN;
      canvas.height = KART_BOY;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      drawSeatCard(ctx, {
        provinceId: seat.provinceId,
        partyId: seat.partyId,
        handle: seat.holder.handle,
        price: seat.price,
        at: seat.heldSince ?? undefined,
        takeovers: seat.takeovers,
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return;

      const ad = `partim-lol-${seat.provinceId}-${seat.partyId}.png`;
      const dosya = new File([blob], ad, { type: "image/png" });
      const paylas = navigator.share as ((data: ShareData) => Promise<void>) | undefined;

      if (paylas && navigator.canShare?.({ files: [dosya] })) {
        await paylas
          .call(navigator, {
            files: [dosya],
            text: `${PROVINCE_BY_ID[seat.provinceId]?.name} il başkanlığı bende. partim.lol`,
          })
          .catch(() => undefined);
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = ad;
      a.click();
      // Tarayıcı indirmeyi başlatana kadar adres geçerli kalmalı.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusy(false);
    }
  }, [seat]);

  if (!seat.holder) return null;

  return (
    <Button variant="outline" size="sm" className={className} onClick={() => void uret()} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Share2 />}
      Kartı paylaş
    </Button>
  );
}
