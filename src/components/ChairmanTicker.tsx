import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import type { SeatMarketRow } from "@/backend/types";
import { PARTY_BY_ID, partyColor } from "@/data/parties";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { formatSince } from "@/lib/game";

/**
 * "En son başkan olanlar" kayan bandı.
 *
 * Ana sayfanın üstünde duran haber şeridi gibi: son devredilen il başkanlıkları
 * kullanıcı adıyla ve "kaç dakika/saat önce alındı" bilgisiyle akar. İçerik
 * iki kez yan yana basılır ve track %50 kayarak döner — kesintisiz döngü.
 */
export function ChairmanTicker() {
  const { backend } = useGame();
  const [rows, setRows] = useState<SeatMarketRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const oku = () => {
      void backend
        .getRecentSeatClaims(16)
        .then((next) => {
          if (!cancelled) setRows(next);
        })
        .catch(() => {
          if (!cancelled) setRows([]);
        });
    };
    oku();
    // Satın alma akışı dakikada birkaç kez değişebiliyor; 15 saniye hem şeridi
    // canlı tutar hem sunucuya yük olmaz.
    const id = window.setInterval(oku, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [backend]);

  if (!rows || rows.length === 0) return null;

  const items = rows.map((row, index) => {
    const province = PROVINCE_BY_ID[row.provinceId];
    const party = PARTY_BY_ID[row.partyId];
    return (
      <li
        key={`${row.provinceId}-${row.partyId}-${index}`}
        className="flex shrink-0 items-center gap-2 whitespace-nowrap px-3 text-xs"
      >
        <span
          className="size-2 shrink-0 rounded-[3px]"
          style={{ background: partyColor(row.partyId) }}
        />
        <span className="font-semibold text-foreground/90">@{row.holder?.handle ?? "?"}</span>
        <span className="text-muted-foreground">
          {province?.name ?? row.provinceId} · {party?.name ?? row.partyId}
        </span>
        <span className="rounded-full bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-200/90">
          başkanı oldu
        </span>
        {row.heldSince && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {formatSince(row.heldSince)} önce
          </span>
        )}
        <span className="ml-2 text-white/15" aria-hidden="true">
          •
        </span>
      </li>
    );
  });

  return (
    <div className="glass-flat flex items-center gap-3 overflow-hidden px-4 py-2.5">
      <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <Crown className="size-3.5 text-amber-300" />
        En son başkan olanlar
      </span>

      <div className="kayan-bant relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_28px,black_calc(100%-28px),transparent)]">
        <div className="kayan-bant-track">
          <ul className="kayan-bant-group flex items-center">{items}</ul>
          {/* Kesintisiz döngü için birebir kopya; görünmez olduğundan erişilebilirlikten çıkarılır */}
          <ul className="kayan-bant-group flex items-center" aria-hidden="true">
            {items}
          </ul>
        </div>
      </div>
    </div>
  );
}
