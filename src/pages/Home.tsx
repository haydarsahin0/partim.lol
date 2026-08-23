import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { TurkeyMap, focusProvinceOnMap } from "@/components/TurkeyMap";
import { NationalPanel } from "@/components/NationalPanel";
import { ProvinceDetailView } from "@/components/ProvinceDetailView";
import { ProvinceSearch } from "@/components/ProvinceSearch";
import { PartyLegend } from "@/components/PartyLegend";
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

  return (
    <div className="mx-auto grid w-full max-w-[1800px] flex-1 grid-cols-1 gap-4 p-3 sm:p-4 lg:grid-cols-[300px_minmax(0,1fr)_380px]">
      {/* Sol: ülke geneli */}
      <aside className="order-3 space-y-4 lg:order-1">
        <Card className="p-5">
          <NationalPanel onSelectProvince={selectAndFocus} />
        </Card>
        <Card className="p-5 lg:hidden">
          <PartyLegend />
        </Card>
      </aside>

      {/* Orta: harita */}
      <section className="order-1 flex min-h-[46vh] flex-col gap-3 lg:order-2 lg:min-h-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <ProvinceSearch onPick={selectAndFocus} />
          </div>
          {showHint && (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[hsl(224_44%_6%_/_0.7)] px-3 py-2 text-xs text-muted-foreground backdrop-blur-md">
              <Info className="size-3.5 shrink-0" />
              <span>Tekerlekle yakınlaş, sürükleyerek gez, ile tıkla.</span>
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

        <Card className="relative flex-1 overflow-hidden p-0">
          <TurkeyMap standings={standings} selectedId={selected} onSelect={select} />
        </Card>

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
  );
}
