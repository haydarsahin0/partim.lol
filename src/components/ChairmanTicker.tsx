import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import type { SeatMarketRow } from "@/backend/types";
import { PARTY_BY_ID, partyColor } from "@/data/parties";
import { teamColor, teamName } from "@/data/footballTeams";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { formatSince } from "@/lib/game";

/**
 * "En son başkan olanlar" kayan bandı — hem siyasi hem futbol haritasında.
 *
 * Haber şeridi gibi: son devredilen il/kulüp başkanlıkları kullanıcı adıyla ve
 * "kaç dakika/saat önce alındı" bilgisiyle akar. İçerik iki kez yan yana
 * basılır ve track %50 kayarak döner — kesintisiz döngü.
 *
 * Mobilde etiket yalnızca taç simgesine iner: uzun "EN SON BAŞKAN OLANLAR"
 * yazısı ekranın yarısını yiyor, kayan bant küçücük bir alana sıkışıyordu.
 * Geniş ekranda etiket tam hâliyle durur.
 */
export function ChairmanTicker({ map = "siyasi" }: { map?: "siyasi" | "futbol" }) {
  const { backend } = useGame();
  const [rows, setRows] = useState<SeatMarketRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const oku = () => {
      const istek =
        map === "futbol" ? backend.getRecentFootballSeatClaims(16) : backend.getRecentSeatClaims(16);
      void istek
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
  }, [backend, map]);

  if (!rows || rows.length === 0) return null;

  const futbol = map === "futbol";
  const items = rows.map((row, index) => {
    const province = PROVINCE_BY_ID[row.provinceId];
    const ad = futbol ? teamName(row.partyId) : (PARTY_BY_ID[row.partyId]?.name ?? row.partyId);
    const renk = futbol ? teamColor(row.partyId) : partyColor(row.partyId);
    return (
      <li
        key={`${row.provinceId}-${row.partyId}-${index}`}
        className="flex shrink-0 items-center gap-2 whitespace-nowrap px-3 text-xs"
      >
        <span className="size-2 shrink-0 rounded-[3px]" style={{ background: renk }} />
        <span className="font-semibold text-foreground/90">@{row.holder?.handle ?? "?"}</span>
        <span className="text-muted-foreground">
          {province?.name ?? row.provinceId} · {ad}
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
    <div className="glass-flat flex items-center gap-2 overflow-hidden px-3 py-2.5 sm:gap-3 sm:px-4">
      <span
        className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
        title={futbol ? "Son kulüp başkanları" : "En son başkan olanlar"}
      >
        <Crown className="size-3.5 shrink-0 text-amber-300" />
        {/* Mobilde yalnızca taç: uzun etiket kayan banda yer bırakmıyordu */}
        <span className="hidden sm:inline">
          {futbol ? "Son kulüp başkanları" : "En son başkan olanlar"}
        </span>
      </span>

      <div className="kayan-bant relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_20px,black_calc(100%-20px),transparent)] sm:[mask-image:linear-gradient(90deg,transparent,black_28px,black_calc(100%-28px),transparent)]">
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
