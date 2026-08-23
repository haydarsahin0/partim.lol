import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Radio, TrendingUp } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import type { LiveVote } from "@/backend/types";
import { PARTY_BY_ID, partyColor, partyShortName } from "@/data/parties";
import { PROVINCES, PROVINCE_BY_ID } from "@/data/provinces";
import { useCountUp } from "@/hooks/useCountUp";
import { formatNumber, formatPercent } from "@/lib/game";
import { Card } from "@/components/ui/card";
import { PartyMark } from "@/components/PartyMark";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Seçim gecesi tablosu.
 *
 * Ekrandaki rakamların "canlı" hissettirmesi üç şeye bağlı: yerine oturmak
 * yerine sayarak gelen sayılar, ne kadarının açıldığını gösteren bir ilerleme
 * ve durmadan akan bir oy şeridi. Üçü de burada.
 *
 * "Açılan sandık" oranı, oyu olan il sayısının 81'e bölümü. Uydurma bir sayı
 * değil: haritanın ne kadarının dolduğunu birebir gösteriyor ve boş iller
 * doldukça kendiliğinden yükseliyor.
 */
export function ElectionNight({
  onSelectProvince,
  className,
}: {
  onSelectProvince?: (id: string) => void;
  className?: string;
}) {
  const { national, totalVotes, standings, loading } = useGame();

  const acilan = useMemo(
    () => PROVINCES.filter((p) => (standings[p.id]?.totalVotes ?? 0) > 0).length,
    [standings],
  );
  const oran = (acilan / PROVINCES.length) * 100;

  const sayilanOy = useCountUp(totalVotes, 900);
  const sayilanIl = useCountUp(acilan, 900);

  const lider = national[0];
  const ikinci = national[1];
  const fark = lider && ikinci ? lider.pct - ikinci.pct : 0;

  if (loading && national.length === 0) {
    return (
      <Card className={cn("space-y-3 p-5", className)}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold tracking-[-0.02em]">
          <span className="live-dot" aria-hidden="true" />
          Seçim gecesi
        </h3>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
          <Radio className="size-3" />
          canlı
        </span>
      </div>

      {/* Açılan sandık oranı */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="stat-label">Açılan il</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {sayilanIl} / {PROVINCES.length}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(1.5, oran)}%` }}
          />
        </div>
        <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          %{oran.toFixed(1)} açıldı · {formatNumber(sayilanOy)} oy sayıldı
        </div>
      </div>

      {/* Önde giden */}
      {lider && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
          <PartyMark partyId={lider.partyId} size={40} />
          <div className="min-w-0 flex-1">
            <div className="stat-label">Önde</div>
            <div className="truncate text-sm font-bold">
              {PARTY_BY_ID[lider.partyId]?.name ?? lider.partyId}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className="font-mono text-xl font-black leading-none tabular-nums"
              style={{ color: partyColor(lider.partyId) }}
            >
              {formatPercent(lider.pct)}
            </div>
            {ikinci && (
              <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {fark < 0.05 ? "başa baş" : `+${formatPercent(fark)} fark`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parti yarışı */}
      <div className="mt-4">
        <span className="stat-label">Parti yarışı</span>
        <ul className="mt-2 space-y-2">
          {national.slice(0, 8).map((row, index) => (
            <PartyRow key={row.partyId} row={row} index={index} />
          ))}
        </ul>
      </div>

      <TightRaces onSelectProvince={onSelectProvince} />
      <LiveTicker />
    </Card>
  );
}

function PartyRow({
  row,
  index,
}: {
  row: { partyId: string; votes: number; pct: number; provinces: number };
  index: number;
}) {
  const oy = useCountUp(row.votes, 800);
  return (
    <li>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="w-3 shrink-0 font-mono tabular-nums text-muted-foreground/60">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">
          {partyShortName(row.partyId)}
          <span className="ml-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatNumber(oy)} oy
          </span>
        </span>
        <span className="shrink-0 font-mono text-xs font-bold tabular-nums">
          {formatPercent(row.pct)}
        </span>
      </div>
      <div className="ml-5 mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(1, row.pct)}%`, background: partyColor(row.partyId) }}
        />
      </div>
    </li>
  );
}

/** En az farkla önde bitilen iller — gecenin izlenecek yarışları. */
function TightRaces({ onSelectProvince }: { onSelectProvince?: (id: string) => void }) {
  const { standings } = useGame();
  const races = useMemo(
    () =>
      PROVINCES.map((p) => standings[p.id])
        .filter((s) => s && s.totalVotes > 0 && s.tallies.length > 1)
        .sort((a, b) => a.margin - b.margin)
        .slice(0, 5),
    [standings],
  );

  if (races.length === 0) return null;

  return (
    <div className="mt-4">
      <span className="stat-label flex items-center gap-1.5">
        <TrendingUp className="size-3" />
        Başa baş iller
      </span>
      <ul className="mt-2 space-y-1">
        {races.map((race) => {
          const province = PROVINCE_BY_ID[race.provinceId];
          const [first, second] = race.tallies;
          const content = (
            <>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                {province?.name}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span
                  className="size-2 rounded-[3px]"
                  style={{ background: partyColor(first.partyId) }}
                />
                <span
                  className="size-2 rounded-[3px]"
                  style={{ background: partyColor(second.partyId) }}
                />
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-amber-300">
                {/* Tam eşitlikte "%0,0" yazmak yanlış okunuyor: fark yok demek. */}
                {race.margin < 0.05 ? "berabere" : formatPercent(race.margin)}
              </span>
            </>
          );
          const cls =
            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]";
          return (
            <li key={race.provinceId}>
              {onSelectProvince ? (
                <button type="button" className={cls} onClick={() => onSelectProvince(race.provinceId)}>
                  {content}
                </button>
              ) : (
                <Link to={`/il/${race.provinceId}`} className={cls}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Canlı oy şeridi.
 *
 * Seçim gecesi ekranlarının alt bandı gibi: oylar geldikçe üstten giriyor.
 * Yeni gelen satır kısa bir vurguyla beliriyor, aşağı inenler soluyor —
 * hareket, "bu sayfa donmuş" hissini kıran şey.
 */
function LiveTicker() {
  const { backend, standings } = useGame();
  const [votes, setVotes] = useState<LiveVote[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const oku = () => {
      void backend
        .getLiveVotes(8)
        .then((next) => {
          if (!cancelled) setVotes(next);
        })
        .catch(() => {
          if (!cancelled) setVotes([]);
        });
    };
    oku();
    // Oy akışı 12 saniyede bir tazeleniyor; daha sık istek atmak sunucuya
    // yük, daha seyrek olması da şeridi durgun gösteriyor.
    const id = window.setInterval(oku, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [backend, standings]);

  if (!votes || votes.length === 0) return null;

  return (
    <div className="mt-4 border-t border-white/[0.07] pt-3">
      <span className="stat-label flex items-center gap-1.5">
        <span className="live-dot" aria-hidden="true" />
        Oylar geliyor
      </span>
      <ul className="mt-2 space-y-1" aria-live="polite">
        {votes.slice(0, 5).map((vote, index) => (
          <li
            key={`${vote.at}-${vote.handle}-${index}`}
            className="flex items-center gap-2 text-[11px] leading-tight"
            style={{ opacity: 1 - index * 0.15 }}
          >
            <span
              className="size-2 shrink-0 rounded-[3px]"
              style={{ background: partyColor(vote.partyId) }}
            />
            <span className="truncate font-semibold text-foreground/80">@{vote.handle}</span>
            <span className="shrink-0 text-muted-foreground">→</span>
            <span className="truncate text-muted-foreground">
              {PROVINCE_BY_ID[vote.provinceId]?.name ?? vote.provinceId}
            </span>
            <span className="ml-auto shrink-0 font-semibold text-foreground/70">
              {partyShortName(vote.partyId)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
