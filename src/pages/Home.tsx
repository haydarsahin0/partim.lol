import { useEffect, useState } from "react";
import { Crown, Info, Sparkles, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { TurkeyMap, focusProvinceOnMap } from "@/components/TurkeyMap";
import { ElectionNight } from "@/components/ElectionNight";
import { ProvinceDialog } from "@/components/ProvinceDialog";
import { ProvinceSearch } from "@/components/ProvinceSearch";
import { PartyLegend } from "@/components/PartyLegend";
import { StatsPill } from "@/components/StatsPill";
import { SeatMarket } from "@/components/SeatMarket";
import { ChairmanTicker } from "@/components/ChairmanTicker";
import { CreatePartyDialog } from "@/components/CreatePartyDialog";
import { Button } from "@/components/ui/button";
import {
  LEADER_BASE_PRICE,
  PARTY_WEEKLY_PRICE,
  XP_PER_LEADER_HOUR,
  formatUsd,
} from "@/lib/game";
import { useGame } from "@/backend/GameProvider";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { Card } from "@/components/ui/card";

export default function Home() {
  const { standings, requireAuth } = useGame();
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

      {/* En son başkan olanlar — satın alma akışını gösteren kayan bant */}
      <ChairmanTicker />

      {/*
        Mobil sıralama, düğmelerin göze çarpma sırasıyla aynı: harita →
        başkanlık vitrini → seçili il → ülke geneli. Masaüstünde vitrin sol
        sütunun en üstünde durur; bunun için satır/sütun açıkça veriliyor,
        yoksa grid onu ikinci sütuna atıyor.
      */}
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[268px_minmax(0,1fr)_344px] lg:grid-rows-[auto_minmax(0,1fr)]">
      {/* Seçim gecesi tablosu en üstte: gecenin nabzı (açılan il oranı, parti
          yarışı, akan oylar) sayfayı açar açmaz görünsün. */}
      <ElectionNight
        onSelectProvince={selectAndFocus}
        className="order-2 lg:order-none lg:col-start-1 lg:row-start-1"
      />

      <aside className="order-4 space-y-4 lg:order-none lg:col-start-1 lg:row-start-2">
        <SeatMarket onSelectProvince={selectAndFocus} />
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
            onClick={() => {
              if (!requireAuth("Partini hesabına bağlayabilmemiz için önce giriş yap.")) return;
              setPartyOpen(true);
            }}
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
      <section className="order-1 flex flex-col gap-3 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2">
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

        <div className="glass-flat relative min-h-[34vh] flex-1 overflow-hidden lg:aspect-[2.05/1] lg:min-h-0 lg:flex-none">
          <TurkeyMap standings={standings} selectedId={selected} onSelect={select} />
        </div>

        <Card className="hidden p-4 lg:block">
          <PartyLegend />
        </Card>
      </section>

      {/* Sağ sütun: il artık burada değil, ekranın ortasındaki pencerede
          açılıyor; bu sütun her zaman başkanlık çağrısını gösteriyor. */}
      <aside className="order-3 lg:order-none lg:col-start-3 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-20">
        <Card className="p-6 text-center">
            <Crown className="mx-auto size-7 text-primary" />
            <h2 className="mt-2 font-display text-lg font-bold">İl başkanı ol</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Haritadan bir ile tıkla; parti yüzdelerini gör, oy ver ve o ilin başkanlığını kap.
              Adın ve X hesabın o partinin yanında, ilin sayfasında herkese görünür.
            </p>
            <p className="mt-3 text-[13px] text-muted-foreground">
              Boş koltuk {formatUsd(LEADER_BASE_PRICE)}. Dolu koltuğu devralmak için son ödenen
              bedelin üstüne çık — tavan yok. Elinde tuttuğun her saat +{XP_PER_LEADER_HOUR} XP.
            </p>
        </Card>
      </aside>
      </div>

      <ProvinceDialog
        provinceId={province?.id ?? null}
        onClose={() => setParams({}, { replace: true })}
      />

      <CreatePartyDialog open={partyOpen} onOpenChange={setPartyOpen} />
    </div>
  );
}