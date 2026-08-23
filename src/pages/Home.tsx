import { useEffect, useState } from "react";
import { Info, Sparkles, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { TurkeyMap, focusProvinceOnMap } from "@/components/TurkeyMap";
import { NationalPanel } from "@/components/NationalPanel";
import { ProvinceDetailView } from "@/components/ProvinceDetailView";
import { ProvinceSearch } from "@/components/ProvinceSearch";
import { PartyLegend } from "@/components/PartyLegend";
import { StatsPill } from "@/components/StatsPill";
import { CreatePartyDialog } from "@/components/CreatePartyDialog";
import { Button } from "@/components/ui/button";
import { PARTY_WEEKLY_PRICE, formatUsd } from "@/lib/game";
import { useGame } from "@/backend/GameProvider";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { Card } from "@/components/ui/card";

export default function Home() {
  const { standings } = useGame();
  const [params, setParams] = useSearchParams();
  const selected = params.get("il");

  const select = (provinceId: string) => {
    setParams(provinceId ? { il: provinceId } : {}, { replace: true });
  };

  // Arama veya çekişmeli il listesinden gelindiğinde haritayı da o ile götür
  const selectAndFocus = (provinceId: string) => {
    select(provinceId);
    focusProvinceOnMap(provinceId);
  };

  const [showHint, setShowHint] = useState(() => {
    try {
      return localStorage.getItem("partim.lol/hint-dismissed") !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (showHint) return;
    try {
      localStorage.setItem("partim.lol/hint-dismissed", "1");
    } catch {
      /* depolama kapalı olabilir */
    }
  }, [showHint]);

  const province = selected ? PROVINCE_BY_ID[selected] : null;
  const [partyOpen, setPartyOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3 p-3 sm:p-4">
      {/* Canlı sayaç hapı — sitenin üstünde ortalanmış */}
      <StatsPill />

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[268px_minmax(0,1fr)_344px]">
      {/* Sol: ülke geneli */}
      <aside className="order-3 space-y-4 lg:order-1">
        <Card className="p-5">
          <NationalPanel onSelectProvince={selectAndFocus} />
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-base font-semibold tracking-[-0.02em]">
            Kendi partini kur
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            Haftalık {formatUsd(PARTY_WEEKLY_PRICE)}. Adını, kısaltmanı, logonu ve rengini seç;
            partin 81 ilin pusulasına girsin.
          </p>
          <Button
            variant="primary"
            className="mt-3.5 w-full"
            onClick={() => setPartyOpen(true)}
          >
            <Sparkles />
            Parti kur
          </Button>
        </Card>

        <Card className="p-5 lg:hidden">
          <PartyLegend />
        </Card>
      </aside>

      {/* Orta: harita */}
      <section className="order-1 flex flex-col gap-3 lg:order-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <ProvinceSearch onPick={selectAndFocus} />
          </div>
          {showHint && (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[hsl(224_44%_6%_/_0.7)] px-3 py-2 text-xs text-muted-foreground backdrop-blur-md">
              <Info className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">Tekerlekle yakınlaş, sürükleyerek gez, ile tıkla.</span>
              <span className="sm:hidden">İki parmakla yakınlaş, sürükleyerek gez, ile dokun.</span>
              <button
                type="button"
                onClick={() => setShowHint(false)}
                aria-label="İpucunu kapat"
                className="ml-1 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="glass-flat relative min-h-[54vh] flex-1 overflow-hidden lg:aspect-[2.05/1] lg:min-h-0 lg:flex-none">
          <TurkeyMap standings={standings} selectedId={selected} onSelect={select} />
        </div>

        <Card className="hidden p-4 lg:block">
          <PartyLegend />
        </Card>
      </section>

      {/* Sağ: seçili il */}
      <aside className="order-2 lg:order-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
        {province ? (
          <Card className="flex flex-col p-0 lg:h-full lg:max-h-[min(78vh,calc(100vh-6rem))] lg:overflow-hidden">
            <ProvinceDetailView
              provinceId={province.id}
              showLink
              className="min-h-0"
              onClose={() => setParams({}, { replace: true })}
            />
          </Card>
        ) : (
          <Card className="p-6 text-center">
            <h2 className="font-display text-lg font-bold">Bir il seç</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Haritadan bir ile tıkla; o ilin parti yüzdelerini gör, oy ver ve il başkanlığını kap.
              Her il, en çok oyu alan partinin rengine boyanır.
            </p>
          </Card>
        )}
      </aside>
      </div>

      <CreatePartyDialog open={partyOpen} onOpenChange={setPartyOpen} />
    </div>
  );
}