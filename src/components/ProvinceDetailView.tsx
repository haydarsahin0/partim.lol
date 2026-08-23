import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, MapPin, Users, X } from "lucide-react";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { PARTY_BY_ID, partyColor } from "@/data/parties";
import { useGame } from "@/backend/GameProvider";
import { useProvinceDetail } from "@/hooks/useProvinceDetail";
import { usePaymentReturn } from "@/hooks/usePaymentReturn";
import { ResultsBoard } from "@/components/ResultsBoard";
import { SeatList } from "@/components/SeatList";
import { VoteBallot } from "@/components/VoteBallot";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber, formatPercent, formatSince } from "@/lib/game";
import { cn } from "@/lib/utils";

/** Bir ilin tüm detayları — hem yan panelde hem /il/:id sayfasında kullanılır. */
export function ProvinceDetailView({
  provinceId,
  className,
  showLink = false,
  onClose,
}: {
  provinceId: string;
  className?: string;
  showLink?: boolean;
  /** Verilirse başlıkta bir kapatma düğmesi çıkar (yan panel kullanımı) */
  onClose?: () => void;
}) {
  const province = PROVINCE_BY_ID[provinceId];
  const { standings, refresh } = useGame();
  // Sekme adres çubuğunda tutulur: bir ilin "Başkanlar" görünümü paylaşılabilir olsun.
  const [params, setParams] = useSearchParams();
  const tab = params.get("sekme") ?? "sonuclar";
  const { detail, loading, reload } = useProvinceDetail(provinceId);

  const afterAction = useCallback(() => {
    void reload();
    void refresh();
  }, [reload, refresh]);

  // Stripe Checkout dönüşünde koltuk devredilene kadar yokla.
  usePaymentReturn(provinceId, afterAction);

  if (!province) {
    return <p className="p-4 text-sm text-muted-foreground">İl bulunamadı.</p>;
  }

  // Panel açılır açılmaz boş görünmesin diye önce haritadaki özet kullanılır.
  const standing = detail?.standing ?? standings[provinceId];
  const leading = standing?.leadingPartyId ?? null;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Başlık */}
      <div
        className="relative overflow-hidden rounded-t-2xl border-b border-white/[0.08] px-5 py-4"
        style={{
          background: leading
            ? `linear-gradient(135deg, ${partyColor(leading)}33, transparent 70%)`
            : undefined,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono font-bold text-foreground">
                {String(province.plate).padStart(2, "0")}
              </span>
              <MapPin className="size-3" />
              {province.region}
            </div>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight">
              {province.name}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {showLink && (
              <Link
                to={`/il/${province.id}`}
                className="rounded-lg border border-white/12 p-2 text-muted-foreground transition-colors hover:text-foreground"
                title="İl sayfasını aç"
              >
                <ExternalLink className="size-4" />
              </Link>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Paneli kapat"
                className="rounded-lg border border-white/12 p-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {leading ? (
            <Badge
              className="border-transparent text-[11px]"
              style={{ background: `${partyColor(leading)}26`, color: partyColor(leading) }}
            >
              <span className="size-2 rounded-full" style={{ background: partyColor(leading) }} />
              {PARTY_BY_ID[leading]?.name} önde · {formatPercent(standing?.tallies[0]?.pct ?? 0)}
            </Badge>
          ) : (
            <Badge variant="outline">Henüz oy yok</Badge>
          )}
          <Badge variant="secondary">
            <Users className="size-3" />
            {formatNumber(standing?.totalVotes ?? 0)} oy
          </Badge>
          {standing && standing.tallies.length > 1 && (
            <Badge variant={standing.margin < 3 ? "warning" : "secondary"}>
              fark {formatPercent(standing.margin)}
            </Badge>
          )}
        </div>
      </div>

      {/* İçerik */}
      <div className="thin-scroll min-h-0 flex-1 p-5 lg:overflow-y-auto">
        <Tabs
          value={["sonuclar", "oy", "baskanlar"].includes(tab) ? tab : "sonuclar"}
          onValueChange={(next) => {
            const nextParams = new URLSearchParams(params);
            if (next === "sonuclar") nextParams.delete("sekme");
            else nextParams.set("sekme", next);
            setParams(nextParams, { replace: true });
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="sonuclar" className="flex-1">
              Sonuçlar
            </TabsTrigger>
            <TabsTrigger value="oy" className="flex-1">
              Oy ver
            </TabsTrigger>
            <TabsTrigger value="baskanlar" className="flex-1">
              Başkanlar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sonuclar" className="space-y-5">
            {standing ? (
              <ResultsBoard standing={standing} max={8} />
            ) : (
              <Skeleton className="h-40 w-full" />
            )}

            {detail && detail.recentVotes.length > 0 && (
              <div>
                <h3 className="stat-label mb-2">Son oylar</h3>
                <ul className="space-y-1">
                  {detail.recentVotes.map((row, i) => (
                    <li key={`${row.handle}-${row.at}-${i}`} className="flex items-center gap-2 text-xs">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: partyColor(row.partyId) }}
                      />
                      <span className="font-semibold">@{row.handle}</span>
                      <span className="text-muted-foreground">
                        {PARTY_BY_ID[row.partyId]?.name} oyu verdi
                      </span>
                      <span className="ml-auto text-muted-foreground">{formatSince(row.at)} önce</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="oy">
            <VoteBallot
              provinceId={province.id}
              provinceName={province.name}
              onVoted={afterAction}
            />
          </TabsContent>

          <TabsContent value="baskanlar">
            {loading && !detail ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : detail ? (
              <SeatList
                provinceName={province.name}
                seats={detail.seats}
                onChanged={afterAction}
              />
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
