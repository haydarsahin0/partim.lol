import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Locate } from "lucide-react";
import { MAP_VIEWBOX, PROVINCES, type Province } from "@/data/provinces";
import { NEUTRAL_COLOR, partyColor, partyName } from "@/data/parties";
import type { ProvinceStanding } from "@/backend/types";
import { formatNumber, formatPercent } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  standings: Record<string, ProvinceStanding>;
  selectedId: string | null;
  onSelect: (provinceId: string) => void;
  className?: string;
};

/** k = yakınlaştırma, x/y = viewBox biriminde kaydırma */
type View = { k: number; x: number; y: number };

const MIN_K = 1;
const MAX_K = 14;
const { width: W, height: H } = MAP_VIEWBOX;
const CX = W / 2;
const CY = H / 2;

/**
 * PERFORMANS NOTU — bu dosyanın yapısını belirleyen şey.
 *
 * Önceki sürümde her kaydırma/yakınlaştırma karesinde React yeniden çiziliyordu:
 * 81 <path> + 81 <text> uzlaştırılıyor, üstüne 81 karmaşık yolu bulanıklaştıran
 * bir SVG filtresi yeniden rasterleniyordu. Mobilde bu saniyede birkaç kare
 * demekti; site "donuyor" hissi buradan geliyordu.
 *
 * Şimdi:
 *   - Dönüşüm React dışında, doğrudan DOM'a yazılıyor (kare başına 1 yazma).
 *   - Çizgi kalınlığı vector-effect ile, yazı boyutu CSS değişkeniyle ölçekleniyor;
 *     ikisi de yakınlaştırmayla kendiliğinden düzeliyor, JS hesabı gerekmiyor.
 *   - React yalnızca anlamlı bir şey değişince çiziyor: oy verileri, seçili il ve
 *     etiketin ada mı plakaya mı döneceğini belirleyen kaba yakınlaştırma kademesi.
 *   - Bulanıklık filtresi kaldırıldı.
 */

/** Etiket içeriği yalnızca bu kademeler arasında geçince yeniden hesaplanır. */
const ZOOM_STEPS = [1, 1.25, 1.6, 2, 2.5, 3.2, 4, 5, 6.3, 8, 10, 12, MAX_K];
const zoomStepOf = (k: number) => {
  let step = 0;
  for (let i = 0; i < ZOOM_STEPS.length; i++) if (k >= ZOOM_STEPS[i]) step = i;
  return step;
};

const toWorld = (local: { x: number; y: number }, view: View) => ({
  x: CX + (local.x - CX) / view.k - view.x,
  y: CY + (local.y - CY) / view.k - view.y,
});

const offsetFor = (local: { x: number; y: number }, world: { x: number; y: number }, k: number) => ({
  x: CX + (local.x - CX) / k - world.x,
  y: CY + (local.y - CY) / k - world.y,
});

function clampView(next: View): View {
  const k = Math.min(MAX_K, Math.max(MIN_K, next.k));
  const maxX = (W * (k - 1)) / k / 2;
  const maxY = (H * (k - 1)) / k / 2;
  return {
    k,
    x: Math.min(maxX, Math.max(-maxX, next.x)),
    y: Math.min(maxY, Math.max(-maxY, next.y)),
  };
}

export function TurkeyMap({ standings, selectedId, onSelect, className }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SVGGElement | null>(null);

  const viewRef = useRef<View>({ k: 1, x: 0, y: 0 });
  const targetRef = useRef<View>({ k: 1, x: 0, y: 0 });
  const rafRef = useRef(0);

  const [box, setBox] = useState({ width: 0, height: 0 });
  /** Yalnızca etiket içeriği ve düğme durumları için; kare başına değişmez. */
  const [zoomStep, setZoomStep] = useState(0);
  const [hovered, setHovered] = useState<Province | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const fitScale = box.width > 0 ? Math.min(box.width / W, box.height / H) : 0;

  /**
   * SVG'nin kendi ölçeği. viewBox 1000 birim genişken kutu 400 piksel ise her
   * kullanıcı birimi 0,4 piksel ediyor; etiket boyutu bunu hesaba katmazsa
   * telefonda 12 piksellik yazı ekranda 5 piksel çıkıyordu. paint() her karede
   * okuduğu için ref'te tutuluyor.
   */
  const fitRef = useRef(0);
  fitRef.current = fitScale;

  /* --------------------- dönüşümü doğrudan DOM'a yaz ---------------------- */

  const paint = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const { k, x, y } = viewRef.current;
    scene.setAttribute(
      "transform",
      `translate(${CX} ${CY}) scale(${k}) translate(${-CX + x} ${-CY + y})`,
    );
    // Etiketler EKRANDA sabit piksel boyutunda kalsın diye CSS bu değişkene
    // bölüyor. Değer yakınlaştırma çarpanı DEĞİL, toplam ekran ölçeği:
    // viewBox'ın kutuya sığdırılma oranı da içinde.
    const screenScale = (fitRef.current || 1) * k;
    scene.style.setProperty("--map-k", String(screenScale));
  }, []);

  const tick = useCallback(() => {
    const cur = viewRef.current;
    const target = targetRef.current;
    const f = 0.26;
    const next: View = {
      k: cur.k + (target.k - cur.k) * f,
      x: cur.x + (target.x - cur.x) * f,
      y: cur.y + (target.y - cur.y) * f,
    };
    const settled =
      Math.abs(next.k - target.k) < 0.0004 &&
      Math.abs(next.x - target.x) < 0.04 &&
      Math.abs(next.y - target.y) < 0.04;

    viewRef.current = settled ? target : next;
    paint();
    setZoomStep((prev) => {
      const step = zoomStepOf(viewRef.current.k);
      return step === prev ? prev : step;
    });
    rafRef.current = settled ? 0 : requestAnimationFrame(tick);
  }, [paint]);

  /**
   * `immediate` doğrudan dokunma içindir (sürükleme, kıstırma): orada araya
   * yumuşatma girerse hareket parmağın gerisinde kalır.
   */
  const applyView = useCallback(
    (next: View, immediate = false) => {
      const clamped = clampView(next);
      targetRef.current = clamped;
      if (immediate) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        viewRef.current = clamped;
        paint();
        setZoomStep((prev) => {
          const step = zoomStepOf(clamped.k);
          return step === prev ? prev : step;
        });
        return;
      }
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
    },
    [paint, tick],
  );

  useEffect(() => {
    paint();
    return () => cancelAnimationFrame(rafRef.current);
  }, [paint]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ width, height });
    });
    observer.observe(el);
    setBox({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const toLocal = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg || !fitScale) return { x: CX, y: CY };
      const rect = svg.getBoundingClientRect();
      const offsetX = (rect.width - W * fitScale) / 2;
      const offsetY = (rect.height - H * fitScale) / 2;
      return {
        x: (clientX - rect.left - offsetX) / fitScale,
        y: (clientY - rect.top - offsetY) / fitScale,
      };
    },
    [fitScale],
  );

  const zoomBy = useCallback(
    (factor: number, local: { x: number; y: number }, immediate = false) => {
      const base = immediate ? viewRef.current : targetRef.current;
      const k = Math.min(MAX_K, Math.max(MIN_K, base.k * factor));
      if (k === base.k) return;
      const world = toWorld(local, base);
      applyView({ k, ...offsetFor(local, world, k) }, immediate);
    },
    [applyView],
  );

  /* ------------------------- işaretçi jestleri ---------------------------- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; k: number; world: { x: number; y: number } } | null>(null);
  const grab = useRef<{ world: { x: number; y: number }; moved: boolean } | null>(null);
  const draggedRef = useRef(false);

  const midpoint = () => {
    const list = [...pointers.current.values()];
    const sum = list.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / list.length, y: sum.y / list.length };
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  /**
   * İşaretçi yakalamayı BURADA YAPMIYORUZ — bilerek.
   *
   * `setPointerCapture` bir kez çağrıldığında tarayıcı yalnızca işaretçi
   * olaylarını değil, onların uyumluluk karşılıklarını da (mousedown/mouseup
   * ve dolayısıyla `click`) yakalayan elemana yönlendiriyor. Yakalama SVG
   * kökünde olduğu için illerin üzerindeki `onClick` hiç çalışmıyor ve
   * haritaya tıklamak sessizce hiçbir şey yapmıyordu.
   *
   * Yakalama yalnızca gerçekten sürükleme başladığında (eşik aşıldığında) ya
   * da ikinci parmak değdiğinde alınıyor; ikisinde de artık tıklama beklentisi
   * yok, ama parmak/fare elemanın dışına çıktığında hareketin kopmaması için
   * yakalama şart.
   */
  const yakala = (target: SVGSVGElement, pointerId: number) => {
    try {
      if (!target.hasPointerCapture(pointerId)) target.setPointerCapture(pointerId);
    } catch {
      /* işaretçi çoktan bırakılmış olabilir; sürükleme yine de çalışır */
    }
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      draggedRef.current = false;
      grab.current = { world: toWorld(toLocal(e.clientX, e.clientY), viewRef.current), moved: false };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      yakala(e.currentTarget, e.pointerId);
      const mid = midpoint();
      grab.current = null;
      pinch.current = {
        distance: spread(),
        k: viewRef.current.k,
        world: toWorld(toLocal(mid.x, mid.y), viewRef.current),
      };
      draggedRef.current = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse") setCursor({ x: e.clientX, y: e.clientY });
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinch.current) {
      const distance = spread();
      if (distance <= 0 || pinch.current.distance <= 0) return;
      const k = Math.min(
        MAX_K,
        Math.max(MIN_K, pinch.current.k * (distance / pinch.current.distance)),
      );
      const mid = midpoint();
      applyView({ k, ...offsetFor(toLocal(mid.x, mid.y), pinch.current.world, k) }, true);
      return;
    }

    const held = grab.current;
    if (!held) return;
    const local = toLocal(e.clientX, e.clientY);
    if (!held.moved) {
      const start = offsetFor(local, held.world, viewRef.current.k);
      const moved = Math.hypot(start.x - viewRef.current.x, start.y - viewRef.current.y) * fitScale;
      if (moved < 4) return;
      held.moved = true;
      draggedRef.current = true;
      // Sürükleme kesinleşti: artık yakalayabiliriz (bkz. onPointerDown).
      yakala(e.currentTarget, e.pointerId);
    }
    applyView({ k: viewRef.current.k, ...offsetFor(local, held.world, viewRef.current.k) }, true);
  };

  const endPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      grab.current = null;
    } else if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      grab.current = { world: toWorld(toLocal(only.x, only.y), viewRef.current), moved: true };
    }
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022));
      zoomBy(factor, toLocal(e.clientX, e.clientY), e.ctrlKey);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toLocal, zoomBy]);

  const focusProvince = useCallback(
    (province: Province) => {
      const k = Math.min(MAX_K, Math.max(3, 2600 / Math.sqrt(Math.max(province.area, 1))));
      applyView({ k, x: CX - province.cx, y: CY - province.cy });
    },
    [applyView],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const province = PROVINCES.find((p) => p.id === (e as CustomEvent<string>).detail);
      if (province) focusProvince(province);
    };
    window.addEventListener("partim:focus-province", handler);
    return () => window.removeEventListener("partim:focus-province", handler);
  }, [focusProvince]);

  /* ------------------------------- çizim ---------------------------------- */

  // Yakınlaştırmaya BAĞLI DEĞİL: kontur kalınlığı vector-effect ile sabit kalıyor.
  const paths = useMemo(
    () =>
      PROVINCES.map((province) => {
        const standing = standings[province.id];
        const leading = standing?.leadingPartyId ?? null;
        const margin = standing?.margin ?? 0;
        const selected = selectedId === province.id;
        return (
          <path
            key={province.id}
            d={province.d}
            className="province-path"
            fill={leading ? partyColor(leading) : NEUTRAL_COLOR}
            fillOpacity={selected ? 1 : leading ? 0.74 + Math.min(0.26, margin / 60) : 0.3}
            stroke={selected ? "#ffffff" : "rgba(3,7,18,0.75)"}
            strokeWidth={selected ? 2.2 : 0.9}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            tabIndex={0}
            role="button"
            aria-label={`${province.name} — ${leading ? `${partyName(leading)} önde` : "henüz oy yok"}`}
            style={{ cursor: "pointer" }}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(province)}
            onPointerLeave={() => setHovered((h) => (h?.id === province.id ? null : h))}
            onClick={() => {
              if (draggedRef.current) return;
              onSelect(province.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(province.id);
              }
            }}
          />
        );
      }),
    [standings, selectedId, onSelect],
  );

  /**
   * Etiketler: yazı boyutu CSS'te `--map-k` üzerinden ölçekleniyor, yani
   * yakınlaştırma sırasında React'e hiç uğramadan ekranda sabit piksel
   * boyutunda kalıyor. Burada yalnızca "ada mı plakaya mı yer var" kararı
   * veriliyor ve bu karar kaba kademelerle değiştiği için nadiren çiziliyor.
   */
  // Kutu boyutu değişince --map-k'yi yeniden yaz; yoksa yeni fitScale bir
  // sonraki kareye kadar uygulanmıyor ve etiketler bir an yanlış boyda kalıyor.
  useEffect(() => {
    paint();
  }, [fitScale, paint]);

  const labels = useMemo(() => {
    if (!fitScale) return null;
    const k = ZOOM_STEPS[zoomStep] ?? 1;
    const screenScale = fitScale * k;
    const compact = box.width < 520;
    const namePx = compact ? 13.5 : 15;

    return PROVINCES.map((province) => {
      const across = Math.sqrt(province.area) * screenScale;
      const showName = across > province.name.length * namePx * 0.53 + 8;
      const showPlate = !showName && across > 26;
      if (!showName && !showPlate) return null;

      return (
        <text
          key={province.id}
          x={province.cx}
          y={province.cy}
          textAnchor="middle"
          dominantBaseline="central"
          className={showName ? "map-label map-label-name" : "map-label map-label-plate"}
          data-compact={compact ? "true" : undefined}
        >
          {showName ? province.name : String(province.plate).padStart(2, "0")}
        </text>
      );
    });
  }, [fitScale, zoomStep, box.width]);

  const hoveredStanding = hovered ? standings[hovered.id] : undefined;
  const currentK = ZOOM_STEPS[zoomStep] ?? 1;

  return (
    <div ref={wrapRef} className={cn("relative h-full w-full", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full select-none"
        preserveAspectRatio="xMidYMid meet"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={() => {
          setHovered(null);
          setCursor(null);
        }}
      >
        <g ref={sceneRef} className="map-scene">
          <g>{paths}</g>
          <g aria-hidden="true" pointerEvents="none">
            {labels}
          </g>
        </g>
      </svg>

      <div className="pointer-events-auto absolute bottom-3 right-3 flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Yakınlaştır"
          disabled={currentK >= MAX_K - 0.001}
          onClick={() => zoomBy(1.6, { x: CX, y: CY })}
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Uzaklaştır"
          disabled={currentK <= MIN_K + 0.001}
          onClick={() => zoomBy(1 / 1.6, { x: CX, y: CY })}
        >
          <Minus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Haritayı sıfırla"
          onClick={() => applyView({ k: 1, x: 0, y: 0 })}
        >
          <Locate />
        </Button>
      </div>

      {hovered && cursor && (
        <div
          className="glass-pill pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-[calc(100%+14px)] px-3 py-2 text-xs"
          style={{ left: cursor.x, top: cursor.y }}
        >
          <div className="flex items-center gap-2 font-semibold">
            <span className="font-mono text-[10px] text-muted-foreground">
              {String(hovered.plate).padStart(2, "0")}
            </span>
            {hovered.name}
          </div>
          {hoveredStanding?.leadingPartyId ? (
            <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ background: partyColor(hoveredStanding.leadingPartyId) }}
              />
              <span className="font-semibold text-foreground">
                {partyName(hoveredStanding.leadingPartyId)}
              </span>
              <span>{formatPercent(hoveredStanding.tallies[0]?.pct ?? 0)}</span>
              <span className="opacity-60">· {formatNumber(hoveredStanding.totalVotes)} oy</span>
            </div>
          ) : (
            <div className="mt-1 text-muted-foreground">Henüz oy yok</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Harita bileşenini herhangi bir yerden bir ile odaklamak için */
export function focusProvinceOnMap(provinceId: string) {
  window.dispatchEvent(new CustomEvent("partim:focus-province", { detail: provinceId }));
}
