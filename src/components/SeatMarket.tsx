import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Crown, Flame } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import type { SeatMarketSummary } from "@/backend/types";
import { PARTY_BY_ID } from "@/data/parties";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { LEADER_BASE_PRICE, formatUsd } from "@/lib/game";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BotDot } from "@/components/BotDot";
import { PartyMark } from "@/components/PartyMark";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Başkanlık vitrini.
 *
 * Oyunun para kazandıran ve en çok merak uyandıran kısmı il başkanlığı, ama
 * ana sayfada hiçbir izi yoktu: koltukları görmek için önce bir il seçip
 * sekme değiştirmek gerekiyordu. Burada ülke genelindeki en değerli
 * koltukları, kimin elinde olduklarını ve devralma bedelini doğrudan
 * gösteriyoruz — fiyat merdiveni ($1 → $2 → $3 …) görünür olunca hem rekabet
 * hem aciliyet kendiliğinden anlaşılıyor.
 */
export function SeatMarket({
  onSelectProvince,
  className,
}: {
  onSelectProvince?: (id: string) => void;
  className?: string;
}) {
  const { backend, standings } = useGame();
  const [data, setData] = useState<SeatMarketSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void backend
      .getSeatMarket(6)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (!cancelled) setData({ held: 0, volume: 0, hot: [] });
      });
    return () => {
      cancelled = true;
    };
    // standings değişince (oy verildi, sayfa tazelendi) vitrin de tazelensin.
  }, [backend, standings]);

  const total = 81 * Object.keys(PARTY_BY_ID).length;
  const held = data?.held ?? 0;

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 font-display text-base font-semibold tracking-[-0.02em]">
            <Crown className="size-4 text-primary" />
            İl başkanlığı
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            Boş koltuk {formatUsd(LEADER_BASE_PRICE)}. Dolu koltuğu devralmak için
            <strong className="text-foreground"> son ödenen bedelin üstüne çıkman</strong> yeter —
            tavan yok, ne kadar yüksek ödersen koltuğu o kadar zor kaptırırsın. Sende kaldığı her
            saat +20 XP.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="dolu koltuk" value={held.toString()} />
        <Stat label="boş koltuk" value={Math.max(0, total - held).toString()} />
        <Stat label="hacim" value={formatUsd(data?.volume ?? 0)} />
      </div>

      <div className="mt-4">
        <span className="stat-label flex items-center gap-1.5">
          <Flame className="size-3" />
          En çok el değiştirenler
        </span>

        {!data ? (
          <div className="mt-2 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : data.hot.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Henüz hiçbir koltuk alınmadı. İlk başkan sen ol — bir ile tıkla, Başkanlar sekmesine
            geç, {formatUsd(LEADER_BASE_PRICE)} ile koltuğu kap.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {data.hot.map((seat) => {
              const province = PROVINCE_BY_ID[seat.provinceId];
              const party = PARTY_BY_ID[seat.partyId];
              const content = (
                <>
                  <PartyMark partyId={seat.partyId} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">
                      {province?.name ?? seat.provinceId}
                      <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                        {party?.shortName ?? seat.partyId}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      {seat.holder ? (
                        <>
                          <Avatar
                            src={seat.holder.avatarUrl}
                            handle={seat.holder.handle}
                            size={14}
                          />
                          <span className="truncate">@{seat.holder.handle}</span>
                          {seat.holder.isBot && <BotDot />}
                        </>
                      ) : (
                        "boş"
                      )}
                    </div>
                  </div>
                  <Badge variant="default" className="shrink-0 gap-1">
                    {formatUsd(seat.nextPrice)}
                    <ArrowUpRight className="size-3" />
                  </Badge>
                </>
              );

              const className =
                "flex w-full items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]";

              // Ana sayfada ili sağ panelde açmak, il sayfasına gitmekten hızlı.
              return (
                <li key={`${seat.provinceId}-${seat.partyId}`}>
                  {onSelectProvince ? (
                    <button
                      type="button"
                      className={className}
                      onClick={() => onSelectProvince(seat.provinceId)}
                    >
                      {content}
                    </button>
                  ) : (
                    <Link to={`/il/${seat.provinceId}`} className={className}>
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-center">
      <div className="font-mono text-sm font-bold tabular-nums">{value}</div>
      <div className="stat-label mt-0.5">{label}</div>
    </div>
  );
}
