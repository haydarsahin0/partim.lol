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

type View = { k: number; x: number; y: number };

const MIN_K = 1;
const MAX_K = 9;
/** Bu alanın altındaki iller ancak yakınlaşınca etiketlenir */
const LABEL_AREA = 900;

export function TurkeyMap({ standings, selectedId, onSelect, className }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [hovered, setHovered] = useState<Province | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; captured: boolean } | null>(null);
  /** Sürükleme bitince gelen tıklamayı yut; her yeni basışta sıfırlanır. */
  const draggedRef = useRef(false);

  const { width, height } = MAP_VIEWBOX;

  /** Görüntüyü haritanın dışına kaçmayacak şekilde sınırla */
  const clamp = useCallback(
    (next: View): View => {
      const k = Math.min(MAX_K, Math.max(MIN_K, next.k));
      const maxX = (width * (k - 1)) / k / 2;
      const maxY = (height * (k - 1)) / k / 2;
      return {
        k,
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [width, height],
  );

  /** Ekran koordinatını viewBox koordinatına çevirir */
  const toLocal = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / MAP_VIEWBOX.width, rect.height / MAP_VIEWBOX.height);
    const offsetX = (rect.width - MAP_VIEWBOX.width * scale) / 2;
    const offsetY = (rect.height - MAP_VIEWBOX.height * scale) / 2;
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    };
  }, []);

  const zoomAt = useCallback(
    (factor: number, focusX: number, focusY: number) => {
      setView((prev) => {
        const k = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
        if (k === prev.k) return prev;
        // Odak noktası sabit kalsın diye kaydırmayı yeniden hesapla
        const cx = width / 2;
        const cy = height / 2;
        const worldX = (focusX - cx) / prev.k - prev.x;
        const worldY = (focusY - cy) / prev.k - prev.y;
        return clamp({ k, x: (focusX - cx) / k - worldX, y: (focusY - cy) / k - worldY });
      });
    },
    [clamp, width, height],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const { x, y } = toLocal(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, x, y);
    },
    [toLocal, zoomAt],
  );

  // React'in pasif wheel dinleyicisi preventDefault'a izin vermediği için
  // tekerlek olayını elle, pasif olmayan modda bağlıyoruz.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = toLocal(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, x, y);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toLocal, zoomAt]);

  // Pointer yakalama BİLEREK basış anında yapılmıyor: yakalama açıkken Chromium
  // uyumluluk fare olaylarını da SVG köküne yönlendiriyor ve il yollarının click
  // olayı hiç tetiklenmiyor. Yakalamayı ancak gerçekten sürükleme başlayınca açıyoruz.
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    draggedRef.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, captured: false };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    setCursor({ x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.captured) {
      if (Math.hypot(dx, dy) < 4) return;
      d.captured = true;
      draggedRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    d.x = e.clientX;
    d.y = e.clientY;
    const rect = svgRef.current?.getBoundingClientRect();
    const scale = rect ? Math.min(rect.width / width, rect.height / height) : 1;
    setView((prev) => clamp({ ...prev, x: prev.x + dx / (scale * prev.k), y: prev.y + dy / (scale * prev.k) }));
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current?.captured && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  };

  /** Seçili ile yumuşakça odaklan */
  const focusProvince = useCallback(
    (province: Province, k = 3.4) => {
      setView(clamp({ k, x: width / 2 - province.cx, y: height / 2 - province.cy }));
    },
    [clamp, width, height],
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

  const hoveredStanding = hovered ? standings[hovered.id] : undefined;

  const paths = useMemo(
    () =>
      PROVINCES.map((province) => {
        const standing = standings[province.id];
        const leading = standing?.leadingPartyId ?? null;
        const fill = leading ? partyColor(leading) : NEUTRAL_COLOR;
        // Fark ne kadar azsa il o kadar solgun görünür — çekişmeli iller belli olsun
        const margin = standing?.margin ?? 0;
        const opacity = leading ? 0.74 + Math.min(0.26, margin / 60) : 0.32;
        const selected = selectedId === province.id;
        return (
          <path
            key={province.id}
            d={province.d}
            className="province-path"
            fill={fill}
            fillOpacity={selected ? 1 : opacity}
            stroke={selected ? "#ffffff" : "rgba(6,10,20,0.85)"}
            strokeWidth={selected ? 1.6 / view.k : 0.5 / view.k}
            strokeLinejoin="round"
            data-selected={selected}
            tabIndex={0}
            role="button"
            aria-label={`${province.name} — ${
              leading ? `${partyName(leading)} önde` : "henüz oy yok"
            }`}
            onPointerEnter={() => setHovered(province)}
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

  const labels = useMemo(() => {
    const showAll = view.k >= 2.2;
    const showNames = view.k >= 3;
    return PROVINCES.filter((p) => showAll || p.area >= LABEL_AREA).map((province) => (
      <text
        key={province.id}
        x={province.cx}
        y={province.cy}
        textAnchor="middle"
        dominantBaseline="middle"
        pointerEvents="none"
        fill="rgba(255,255,255,0.92)"
        stroke="rgba(3,6,14,0.85)"
        strokeWidth={2.2 / view.k}
        paintOrder="stroke"
        fontSize={(showNames ? 7 : 8) / view.k}
        fontWeight={700}
        style={{ letterSpacing: showNames ? "0.01em" : "0" }}
      >
        {showNames ? province.name : String(province.plate).padStart(2, "0")}
      </text>
    ));
  }, [view.k]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full touch-none select-none"
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          setHovered(null);
          setCursor(null);
        }}
        style={{ cursor: "grab" }}
      >
        <defs>
          <filter id="map-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g
          transform={`translate(${width / 2} ${height / 2}) scale(${view.k}) translate(${
            -width / 2 + view.x
          } ${-height / 2 + view.y})`}
        >
          {/* Parlama katmanı yalnızca görseldir: <use> ile aynı yolları
              tekrar çizeriz, böylece tıklanabilir öğeler ikiye katlanmaz. */}
          <use
            href="#partim-provinces"
            filter="url(#map-glow)"
            opacity={0.38}
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
          size="icon"
          aria-label="Yakınlaştır"
          onClick={() => zoomAt(1.35, width / 2, height / 2)}
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Uzaklaştır"
          onClick={() => zoomAt(1 / 1.35, width / 2, height / 2)}
        >
          <Minus />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Haritayı sıfırla"
          onClick={() => setView({ k: 1, x: 0, y: 0 })}
        >
          <Locate />
        </Button>
      </div>

      {/* İmleç ipucu */}
      {hovered && cursor && (
        <div
          className="pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-lg border border-white/12 bg-[hsl(224_44%_6%_/_0.92)] px-3 py-2 text-xs shadow-2xl backdrop-blur"
          style={{ left: cursor.x, top: cursor.y }}
        >
          <div className="flex items-center gap-2 font-semibold">
            <span className="text-[10px] font-mono text-muted-foreground">
              {String(hovered.plate).padStart(2, "0")}
            </span>
            {hovered.name}
          </div>
          {hoveredStanding && hoveredStanding.leadingPartyId ? (
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
