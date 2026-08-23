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
 * Ekran koordinatı (viewBox birimi) ile dünya koordinatı arasındaki dönüşüm.
 *
 * Uygulanan transform:  translate(CX,CY) scale(k) translate(-CX+x, -CY+y)
 *   ekran = C + k * (dünya - C + v)
 * Tersi aşağıda. Hem parmakla sürüklemede hem de yakınlaştırmada "tutulan
 * nokta parmağın altında kalsın" davranışını bu iki fonksiyon sağlıyor.
 */
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

  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const targetRef = useRef(view);
  const rafRef = useRef(0);

  /** Kapsayıcının ekran boyutu — etiketleri piksel cinsinden sabit tutmak için */
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<Province | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  /* -------------------------- görünüm animasyonu -------------------------- */

  const tick = useCallback(() => {
    const cur = viewRef.current;
    const target = targetRef.current;
    // Kritik sönümlemeye yakın bir yaklaşma: hızlı başlar, yumuşak durur.
    const f = 0.24;
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
    setView(viewRef.current);
    rafRef.current = settled ? 0 : requestAnimationFrame(tick);
  }, []);

  /**
   * `immediate` doğrudan dokunma içindir (sürükleme, kıstırma): orada araya
   * yumuşatma girerse hareket parmağın gerisinde kalıyor ve "ağır" hissettiriyor.
   * Tekerlek ve düğmeler animasyonlu gider.
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
        setView(clamped);
        return;
      }
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  /* ---------------------------- ölçü takibi ------------------------------- */

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

  /** viewBox birimi → CSS pikseli (yakınlaştırma hariç) */
  const fitScale = box.width > 0 ? Math.min(box.width / W, box.height / H) : 0;
  /** viewBox birimi → CSS pikseli (yakınlaştırma dâhil) */
  const screenScale = fitScale * view.k;

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
  /** Kıstırma başlangıcındaki durum */
  const pinch = useRef<{ distance: number; k: number; world: { x: number; y: number } } | null>(null);
  /** Tek parmakla sürüklemede sabit tutulan dünya noktası */
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

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointers.current.size === 1) {
      draggedRef.current = false;
      grab.current = { world: toWorld(toLocal(e.clientX, e.clientY), viewRef.current), moved: false };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      const mid = midpoint();
      grab.current = null;
      pinch.current = {
        distance: spread(),
        k: viewRef.current.k,
        world: toWorld(toLocal(mid.x, mid.y), viewRef.current),
      };
      // İki parmağa geçildiği an tıklama sayılmasın
      draggedRef.current = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse") setCursor({ x: e.clientX, y: e.clientY });

    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinch.current) {
      const mid = midpoint();
      const distance = spread();
      if (distance <= 0 || pinch.current.distance <= 0) return;
      const k = Math.min(MAX_K, Math.max(MIN_K, pinch.current.k * (distance / pinch.current.distance)));
      applyView({ k, ...offsetFor(toLocal(mid.x, mid.y), pinch.current.world, k) }, true);
      return;
    }

    const held = grab.current;
    if (!held) return;
    const local = toLocal(e.clientX, e.clientY);
    if (!held.moved) {
      // Küçük titremeleri sürükleme sayma; yoksa her dokunuş tıklamayı yutar.
      const start = offsetFor(local, held.world, viewRef.current.k);
      const moved = Math.hypot(start.x - viewRef.current.x, start.y - viewRef.current.y) * fitScale;
      if (moved < 4) return;
      held.moved = true;
      draggedRef.current = true;
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
      // Bir parmak kalkınca kalanla sürüklemeye devam et
      const [only] = [...pointers.current.values()];
      grab.current = { world: toWorld(toLocal(only.x, only.y), viewRef.current), moved: true };
    }
  };

  // React'in tekerlek dinleyicisi pasif olduğu için preventDefault edemiyoruz;
  // elle, pasif olmayan modda bağlıyoruz.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Trackpad'de pinch, ctrlKey ile gelir ve daha ince adımlar ister.
      const factor = Math.exp((-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022)) / 1);
      zoomBy(factor, toLocal(e.clientX, e.clientY), e.ctrlKey);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toLocal, zoomBy]);

  /** Dışarıdan bir ile odaklan */
  const focusProvince = useCallback(
    (province: Province) => {
      const k = Math.min(MAX_K, Math.max(3, 2600 / Math.sqrt(Math.max(province.area, 1))));
      applyView({ k, x: CX - province.cx, y: CY - province.cy });
    },
    [applyView],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const province = PROVINCES.find((p) => p.id === id);
      if (province) focusProvince(province);
    };
    window.addEventListener("partim:focus-province", handler);
    return () => window.removeEventListener("partim:focus-province", handler);
  }, [focusProvince]);

  /* ------------------------------- çizim ---------------------------------- */

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
            strokeWidth={(selected ? 1.8 : 0.5) / view.k}
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
    [standings, selectedId, onSelect, view.k],
  );

  /**
   * Etiketler ekranda SABİT boyutta durur: yazı tipi boyutu viewBox biriminde
   * değil, piksele göre hesaplanır. Önceki sürümde etiketler haritayla birlikte
   * küçüldüğü için mobilde okunmuyordu.
   *
   * Her il için ada mı plakaya mı yer var, ilin ekrandaki genişliğine bakılarak
   * karar verilir — böylece yakınlaştıkça etiketler kendiliğinden açılır.
   */
  const labels = useMemo(() => {
    if (!screenScale) return null;
    const compact = box.width < 520;
    const namePx = compact ? 12 : 13.5;
    const platePx = compact ? 11 : 12;

    return PROVINCES.map((province) => {
      const across = Math.sqrt(province.area) * screenScale;
      const nameWidth = province.name.length * namePx * 0.53 + 8;
      const showName = across > nameWidth;
      const showPlate = !showName && across > 22;
      if (!showName && !showPlate) return null;

      const px = showName ? namePx : platePx;
      return (
        <text
          key={province.id}
          x={province.cx}
          y={province.cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          stroke="rgba(2,5,12,0.9)"
          strokeWidth={(showName ? 3 : 2.6) / screenScale}
          paintOrder="stroke"
          fontSize={px / screenScale}
          fontWeight={650}
          style={{ letterSpacing: showName ? "-0.01em" : "0.02em" }}
        >
          {showName ? province.name : String(province.plate).padStart(2, "0")}
        </text>
      );
    });
  }, [screenScale, box.width]);

  const hoveredStanding = hovered ? standings[hovered.id] : undefined;
  const atMin = view.k <= MIN_K + 0.001;
  const atMax = view.k >= MAX_K - 0.001;

  return (
    <div ref={wrapRef} className={cn("relative h-full w-full", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full select-none"
        preserveAspectRatio="xMidYMid meet"
        // touch-action: none — tarayıcının kendi kaydırma/yakınlaştırma jestini
        // devralmasını engeller, yoksa iki parmak sayfayı zoomluyor.
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
        <defs>
          <filter id="map-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g
          transform={`translate(${CX} ${CY}) scale(${view.k}) translate(${-CX + view.x} ${-CY + view.y})`}
        >
          {/* Parlama katmanı yalnızca görseldir: <use> ile aynı yolları tekrar
              çizeriz, böylece tıklanabilir öğeler ikiye katlanmaz. */}
          <use
            href="#partim-provinces"
            filter="url(#map-glow)"
            opacity={0.34}
            aria-hidden="true"
            pointerEvents="none"
          />
          <g id="partim-provinces">{paths}</g>
          <g aria-hidden="true" pointerEvents="none">
            {labels}
          </g>
        </g>
      </svg>

      {/* Yakınlaştırma denetimleri */}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Yakınlaştır"
          disabled={atMax}
          onClick={() => zoomBy(1.6, { x: CX, y: CY })}
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Uzaklaştır"
          disabled={atMin}
          onClick={() => zoomBy(1 / 1.6, { x: CX, y: CY })}
        >
          <Minus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Haritayı sıfırla"
          disabled={atMin && Math.abs(view.x) < 0.5 && Math.abs(view.y) < 0.5}
          onClick={() => applyView({ k: 1, x: 0, y: 0 })}
        >
          <Locate />
        </Button>
      </div>

      {/* İmleç ipucu — yalnızca fare ile */}
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
