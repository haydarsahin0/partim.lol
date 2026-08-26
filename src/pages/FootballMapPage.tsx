import { useMemo, useState } from "react";
import { Crown, Sparkles, Trophy } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { TurkeyMap, focusProvinceOnMap } from "@/components/TurkeyMap";
import { FootballProvinceDialog } from "@/components/FootballProvinceDialog";
import { FootballProvinceSearch } from "@/components/FootballProvinceSearch";
import { CreateClubDialog } from "@/components/CreateClubDialog";
import {
  FOOTBALL_NEUTRAL_COLOR,
  FOOTBALL_TEAMS,
  teamColor,
  teamName,
} from "@/data/footballTeams";
import { useFootballMapGame } from "@/hooks/useFootballMapGame";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { useGame } from "@/backend/GameProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PARTY_WEEKLY_PRICE, formatPercent, formatUsd } from "@/lib/game";
import { toast } from "sonner";

export default function FootballMapPage() {
  const [params, setParams] = useSearchParams();
  const selectedProvinceId = params.get("il");
  const { profile } = useGame();
  const { standings, vote, claimSeat, dailyVotes, createClub, national, totalVotes, ballotTeams, seats, mySeats, isDemo } =
    useFootballMapGame();
  const nextVoteAt = profile?.nextVoteAt ?? null;
  const [clubOpen, setClubOpen] = useState(false);
  const [dailyBusy, setDailyBusy] = useState(false);

  const select = (provinceId: string) => {
    setParams(provinceId ? { il: provinceId } : {}, { replace: true });
  };

  const selectAndFocus = (provinceId: string) => {
    select(provinceId);
    focusProvinceOnMap(provinceId);
  };

  const leadingTeams = useMemo(() => {
    const counters: Record<string, number> = {};
    for (const standing of Object.values(standings)) {
      if (!standing.leadingPartyId) continue;
      counters[standing.leadingPartyId] = (counters[standing.leadingPartyId] ?? 0) + 1;
    }
    // Dört büyük takım en üstte: aynı il sayısında büyük takım önde.
    return Object.entries(counters)
      .sort((a, b) => {
        if (a[1] !== b[1]) return b[1] - a[1];
        const aMajor = FOOTBALL_TEAMS.find((t) => t.id === a[0])?.major ? 0 : 1;
        const bMajor = FOOTBALL_TEAMS.find((t) => t.id === b[0])?.major ? 0 : 1;
        return aMajor - bMajor;
      })
      .slice(0, 10);
  }, [standings]);

  const selectedStanding = selectedProvinceId ? standings[selectedProvinceId] ?? null : null;
  const selectedSeat = selectedProvinceId
    ? seats.find((s) => s.provinceId === selectedProvinceId) ?? null
    : null;

  const claimFootballSeat = async (provinceId: string, teamId: string) => {
    const result = await claimSeat(provinceId, teamId);
    if (result.kind === "redirect") return true; // Stripe'a gidiyor
    if (result.kind === "done") {
      toast.success(`Kulüp başkanlığı senin!`);
      return true;
    }
    toast.error(result.message);
    return false;
  };

  const daily = async (provinceId: string, teamId: string) => {
    setDailyBusy(true);
    try {
      const result = await dailyVotes(provinceId, teamId);
      if (result.ok) {
        toast.success(`${teamName(teamId)} +${result.votes ?? 60} oy aldı!`);
      } else {
        toast.error(result.message ?? "Günlük oy eklenemedi.");
      }
      return result.ok;
    } finally {
      setDailyBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <h1 className="font-display text-xl font-bold tracking-[-0.02em]">Futbol Haritası</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ana haritadaki mantığın aynısıyla çalışır; bu kez partiler yerine şehir takımları ve
              kurduğun kulüpler yarışır.
            </p>
          </div>

          <FootballProvinceSearch standings={standings} onPick={selectAndFocus} />

          <div className="glass-flat relative min-h-[34vh] flex-1 overflow-hidden lg:aspect-[2.05/1] lg:min-h-0 lg:flex-none">
            <TurkeyMap
              standings={standings}
              selectedId={selectedProvinceId}
              onSelect={select}
              entityColor={teamColor}
              entityName={teamName}
              neutralColor={FOOTBALL_NEUTRAL_COLOR}
            />
          </div>
        </section>

        <aside className="space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold tracking-[-0.02em]">
              <Trophy className="size-4" />
              Lider takımlar
            </h2>
            <p className="text-xs text-muted-foreground">
              Tüm şehir takımları: {FOOTBALL_TEAMS.length} · Toplam oy:{" "}
              {totalVotes.toLocaleString("tr-TR")}
            </p>
            <ul className="space-y-2">
              {leadingTeams.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Henüz oy yok. İlk oyu verip liderliği başlat.
                </li>
              )}
              {leadingTeams.map(([teamId, provinces], index) => (
                <li key={teamId} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-right font-mono text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="size-2.5 rounded-full" style={{ background: teamColor(teamId) }} />
                  <span className="flex-1 truncate font-semibold">{teamName(teamId)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{provinces} il</span>
                </li>
              ))}
            </ul>
          </Card>

          {mySeats.length > 0 && (
            <Card className="space-y-2 p-5">
              <h2 className="flex items-center gap-2 font-display text-base font-bold tracking-[-0.02em]">
                <Crown className="size-4" />
                Senin başkanlıkların
              </h2>
              <ul className="space-y-1.5">
                {mySeats.map((s) => (
                  <li key={`${s.provinceId}-${s.clubId}`} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 rounded-full" style={{ background: teamColor(s.clubId) }} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {teamName(s.clubId)} · {PROVINCE_BY_ID[s.provinceId]?.name ?? s.provinceId}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatUsd(s.price)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                Her gün kulüp başkanı olarak 60 oy ekleyebilirsin (il detayından).
              </p>
            </Card>
          )}

          {/* Toplam yüzdeler — ülke geneli takım payları */}
          <Card className="space-y-3 p-5">
            <h2 className="font-display text-base font-bold tracking-[-0.02em]">Toplam yüzdeler</h2>
            {national.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Henüz oy yok. Oylar geldikçe takımların ülke geneli payı burada görünür.
              </p>
            ) : (
              <>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full ring-1 ring-white/10">
                  {national.slice(0, 10).map((row) => (
                    <div
                      key={row.teamId}
                      style={{ width: `${row.pct}%`, background: teamColor(row.teamId) }}
                      title={`${teamName(row.teamId)} ${formatPercent(row.pct)}`}
                    />
                  ))}
                </div>
                <ul className="space-y-2">
                  {national.slice(0, 8).map((row, index) => (
                    <li key={row.teamId} className="flex items-center gap-2 text-sm">
                      <span className="w-3 text-right font-mono text-[11px] text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: teamColor(row.teamId) }} />
                      <span className="min-w-0 flex-1 truncate font-medium">{teamName(row.teamId)}</span>
                      <span className="font-mono text-xs text-muted-foreground">{row.votes.toLocaleString("tr-TR")}</span>
                      <span className="w-12 text-right font-mono text-xs font-semibold tabular-nums">
                        {formatPercent(row.pct)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          {/* Kendi kulübünü kur — parti kurmayla aynı ücret */}
          <Card className="p-5">
            <h2 className="font-display text-base font-bold tracking-[-0.02em]">
              Kendi kulübünü kur
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Haftalık {formatUsd(PARTY_WEEKLY_PRICE)}. Adını, kısaltmanı, logonu ve rengini seç;
              kulübün tüm illerin pusulasına girsin.
              {isDemo && " Demo modda gerçek ödeme alınmaz; kulüp anında kurulur."}
            </p>
            <Button variant="primary" className="mt-3.5 w-full" onClick={() => setClubOpen(true)}>
              <Sparkles />
              Kulüp kur
            </Button>
          </Card>
        </aside>
      </div>

      <FootballProvinceDialog
        provinceId={selectedProvinceId}
        standing={selectedStanding}
        nextVoteAt={nextVoteAt}
        onVote={async (provinceId, teamId) => (await vote(provinceId, teamId)).ok}
        onClose={() => setParams({}, { replace: true })}
        ballotTeams={ballotTeams}
        seat={selectedSeat}
        onClaimSeat={claimFootballSeat}
        onDailyVotes={daily}
        dailyBusy={dailyBusy}
      />

      <CreateClubDialog
        open={clubOpen}
        onOpenChange={setClubOpen}
        onCreate={async (input) => {
          const result = await createClub(input);
          if (result.kind === "redirect") {
            // Stripe'a gidiyor; dialog kapanır, dönüşte harita tazelenir.
            return { ok: true };
          }
          if (result.kind === "done") {
            toast.success(`${input.name} kuruldu! Artık tüm illerde oy alabilir.`);
            return { ok: true };
          }
          toast.error(result.message ?? "Kulüp kurulamadı.");
          return { ok: false, message: result.message };
        }}
      />
    </div>
  );
}
