import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, Sparkles, X } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import type { SeatMarketSummary } from "@/backend/types";
import { PARTY_BY_ID } from "@/data/parties";
import { PROVINCE_BY_ID, PROVINCES } from "@/data/provinces";
import { LEADER_BASE_PRICE, XP_PER_LEADER_HOUR, formatUsd } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { PartyMark } from "@/components/PartyMark";
import { cn } from "@/lib/utils";

/**
 * Saat başı il başkanlığı hatırlatması.
 *
 * Zamanlama tarayıcıda tutuluyor (localStorage): bir kez gösterildikten sonra
 * bir saat boyunca bir daha çıkmıyor, sekme yenilense de. Sunucuda tutmadık
 * çünkü bu bir oyun kuralı değil, kişisel bir tercih — ve depolama kapalıysa
 * hatırlatma sadece o oturumda bir kez çıkıp susuyor, kullanıcıyı rahatsız
 * etmiyor.
 *
 * "Bir daha gösterme" gerçekten kalıcı: pencereyi kapatmak için kullanıcıyı
 * her seferinde aynı şeyi okumaya zorlamak, hatırlatmanın kendisinden daha
 * çok zarar verir.
 */
const SON_GOSTERIM = "partim.lol/baskanlik-hatirlatma/son";
const KAPALI = "partim.lol/baskanlik-hatirlatma/kapali";
const ARALIK_MS = 60 * 60 * 1000;
/**
 * İlk gösterime kadar geçen süre. Sayfa açılır açılmaz pencere çarpmak,
 * hatırlatmanın işe yaramasından çok kapatılmasına yol açıyor; önce
 * kullanıcının haritaya bakmasına izin veriyoruz. Sonrakiler saat başı.
 */
const ILK_GECIKME_MS = 45_000;

function oku(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function yaz(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* gizli sekmede depolama kapalı olabilir; hatırlatma yine de çalışır */
  }
}

export function LeaderReminder() {
  const { backend, profile, ready } = useGame();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState<SeatMarketSummary | null>(null);

  const kapat = useCallback((kalici: boolean) => {
    setOpen(false);
    yaz(SON_GOSTERIM, String(Date.now()));
    if (kalici) yaz(KAPALI, "1");
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (oku(KAPALI) === "1") return;

    const kalanSure = () => {
      const son = Number(oku(SON_GOSTERIM) ?? 0);
      const gecen = Date.now() - son;
      return son > 0 && gecen < ARALIK_MS ? ARALIK_MS - gecen : ILK_GECIKME_MS;
    };

    let timer = 0;
    const planla = (ms: number) => {
      timer = window.setTimeout(() => {
        setOpen(true);
        yaz(SON_GOSTERIM, String(Date.now()));
        planla(ARALIK_MS);
      }, ms);
    };
    planla(kalanSure());
    return () => window.clearTimeout(timer);
  }, [ready]);

  // Pencere açılırken taze veri: hangi koltuklar boş, en ucuzu kaç para.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void backend
      .getSeatMarket(3)
      .then((next) => !cancelled && setMarket(next))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, backend]);

  /** Kullanıcıyı yollayacağımız il: boş koltuğu olan, kalabalık bir il. */
  const hedef = useMemo(() => {
    const buyukler = ["istanbul", "ankara", "izmir", "bursa", "antalya", "adana", "konya"];
    return buyukler.find((id) => PROVINCE_BY_ID[id]) ?? PROVINCES[0].id;
  }, []);

  if (!open || !profile) return null;

  const bosKoltuk = market ? Math.max(0, 81 * Object.keys(PARTY_BY_ID).length - market.held) : null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="false"
      aria-labelledby="baskanlik-hatirlatma-baslik"
    >
      <div
        className={cn(
          // Camın arkasından okunan metin pencereyi kirletiyordu: buğu kalsın
          // ama zemin belirgin olsun diye ek bir opak kat veriliyor.
          "glass relative w-full max-w-md overflow-hidden bg-[hsl(225_45%_6%_/_0.93)] p-4",
          // Aşağıdan yukarı süzülerek girer; sayfayı kesmeden dikkat çeker.
          "animate-in slide-in-from-bottom-4 fade-in duration-500",
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-primary/25 blur-3xl"
        />

        <button
          type="button"
          onClick={() => kapat(false)}
          aria-label="Hatırlatmayı kapat"
          /*
           * z-10 şart: kapatma düğmesi konumlandırılmış (absolute) ama
           * kendisinden SONRA gelen içerik bloğu da konumlandırılmış
           * (relative). Konumlandırılmış kardeşler DOM sırasına göre boyanır,
           * yani içerik düğmenin üstünü kapatıyor ve tıklamayı yutuyordu.
           */
          className="absolute right-2.5 top-2.5 z-10 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <div className="relative flex items-start gap-3 pr-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 text-primary">
            <Crown className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="baskanlik-hatirlatma-baslik" className="font-display text-base font-bold">
              İl başkanı oldun mu?
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Boş koltuk {formatUsd(LEADER_BASE_PRICE)}. Koltuk sende kaldığı her saat +
              {XP_PER_LEADER_HOUR} XP; adın ve X hesabın o ilin sayfasında partinin yanında
              herkese görünür.
              {bosKoltuk !== null && bosKoltuk > 0 && (
                <> Şu an <strong className="text-foreground">{bosKoltuk}</strong> koltuk boş.</>
              )}
            </p>
          </div>
        </div>

        {market && market.hot.length > 0 && (
          <ul className="relative mt-3 space-y-1.5">
            {market.hot.slice(0, 2).map((seat) => (
              <li
                key={`${seat.provinceId}-${seat.partyId}`}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5"
              >
                <PartyMark partyId={seat.partyId} size={24} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {PROVINCE_BY_ID[seat.provinceId]?.name}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {seat.holder ? `@${seat.holder.handle}` : "boş"}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs font-bold text-primary">
                  {formatUsd(seat.nextPrice)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="relative mt-3.5 flex items-center gap-2">
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              kapat(false);
              navigate(`/il/${hedef}?sekme=baskanlar`);
            }}
          >
            <Sparkles />
            Koltuklara bak
          </Button>
          <Button variant="ghost" size="sm" onClick={() => kapat(true)}>
            Bir daha gösterme
          </Button>
        </div>
      </div>
    </div>
  );
}
