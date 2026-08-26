import { useMemo } from "react";
import { Trophy } from "lucide-react";
import type { ProvinceStanding } from "@/backend/types";
import { FOOTBALL_TEAMS, teamColor, teamName } from "@/data/footballTeams";
import { PROVINCES } from "@/data/provinces";
import { useCountUp } from "@/hooks/useCountUp";
import { formatNumber, formatPercent } from "@/lib/game";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Futbol seçim gecesi tablosu.
 *
 * Partiler haritasındaki ElectionNight'ın futbol karşılığı: en üstte canlı
 * sayılan oy, altında takımların ülke geneli oy oranları (sayı + yüzde),
 * ardından başa baş iller. Lider takımlar ve toplam yüzdeler ayrı kartlarda
 * yan panelde durur; bu kart gecenin nabzını özetler.
 */
export function FootballElectionNight({
  standings,
  national,
  totalVotes,
  onSelectProvince,
  className,
}: {
  standings: Record<string, ProvinceStanding>;
  national: Array<{ teamId: string; votes: number; pct: number }>;
  totalVotes: number;
  onSelectProvince?: (id: string) => void;
  className?: string;
}) {
  const oyVerilen = useMemo(
    () => PROVINCES.filter((p) => (standings[p.id]?.totalVotes ?? 0) > 0).length,
    [standings],
  );

  const sayilanOy = useCountUp(totalVotes, 900);
  const sayilanIl = useCountUp(oyVerilen, 900);
  const yarisanTakim = national.filter((row) => row.votes > 0).length;

  const lider = national[0];
  const ikinci = national[1];
  const fark = lider && ikinci ? lider.pct - ikinci.pct : 0;

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold tracking-[-0.02em]">
          <span className="live-dot" aria-hidden="true" />
          Maç gecesi
        </h3>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
          <span className="live-dot" aria-hidden="true" />
          canlı
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="sayılan oy" value={formatNumber(sayilanOy)} />
        <Stat label="oy verilen il" value={`${sayilanIl}/${PROVINCES.length}`} />
        <Stat label="yarışan takım" value={String(yarisanTakim)} />
      </div>

      {/* Önde giden */}
      {lider && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-[13px] font-black"
            style={{ background: teamColor(lider.teamId), color: "#ffffff" }}
          >
            {FOOTBALL_TEAMS.find((t) => t.id === lider.teamId)?.shortName ?? "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="stat-label">Önde</div>
            <div className="truncate text-sm font-bold">{teamName(lider.teamId)}</div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className="font-mono text-xl font-black leading-none tabular-nums"
              style={{ color: teamColor(lider.teamId) }}
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

      {/* Takım yarışı — oy oranları, sayı + yüzde */}
      <div className="mt-4">
        <span className="stat-label">Takım yarışı</span>
        <ul className="mt-2 space-y-2">
          {national.slice(0, 8).map((row, index) => (
            <TeamRow key={row.teamId} row={row} index={index} />
          ))}
          {national.length === 0 && (
            <li className="text-sm text-muted-foreground">
              Henüz oy yok. İlk oyu verip yarışı başlat.
            </li>
          )}
        </ul>
      </div>

      <TightRaces standings={standings} onSelectProvince={onSelectProvince} />
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-2 py-2 text-center">
      <div className="font-mono text-sm font-bold tabular-nums">{value}</div>
      <div className="stat-label mt-0.5">{label}</div>
    </div>
  );
}

function TeamRow({
  row,
  index,
}: {
  row: { teamId: string; votes: number; pct: number };
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
          {teamName(row.teamId)}
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
          style={{ width: `${Math.max(1, row.pct)}%`, background: teamColor(row.teamId) }}
        />
      </div>
    </li>
  );
}

/** En az farkla önde bitilen iller — gecenin izlenecek yarışları. */
function TightRaces({
  standings,
  onSelectProvince,
}: {
  standings: Record<string, ProvinceStanding>;
  onSelectProvince?: (id: string) => void;
}) {
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
        <Trophy className="size-3" />
        Başa baş iller
      </span>
      <ul className="mt-2 space-y-1">
        {races.map((race) => {
          const province = PROVINCES.find((p) => p.id === race.provinceId);
          const [first, second] = race.tallies;
          return (
            <li key={race.provinceId}>
              <button
                type="button"
                onClick={() => onSelectProvince?.(race.provinceId)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {province?.name ?? race.provinceId}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="size-2 rounded-[3px]" style={{ background: teamColor(first.partyId) }} />
                  <span className="size-2 rounded-[3px]" style={{ background: teamColor(second.partyId) }} />
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-amber-300">
                  {race.margin < 0.05 ? "berabere" : formatPercent(race.margin)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
