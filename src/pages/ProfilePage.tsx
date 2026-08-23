import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Sparkles, Timer, Vote } from "lucide-react";
import { CreatePartyDialog } from "@/components/CreatePartyDialog";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import type { LeaderSeat } from "@/backend/types";
import { PARTY_BY_ID, partyColor, partyTextColor } from "@/data/parties";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LevelBadge } from "@/components/LevelBadge";
import { SignInDialog } from "@/components/SignInDialog";
import { XLogo } from "@/components/XLogo";
import {
  PARTY_WEEKLY_PRICE,
  XP_PER_LEADER_HOUR,
  formatDuration,
  formatNumber,
  formatSince,
  formatUsd,
} from "@/lib/game";

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Vote;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-soft p-3">
      <div className="stat-label flex items-center gap-1.5">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { backend, user, profile } = useGame();
  const [seats, setSeats] = useState<LeaderSeat[]>([]);
  const [signInOpen, setSignInOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const cooldown = useCountdown(profile?.nextVoteAt);

  useEffect(() => {
    if (!user) {
      setSeats([]);
      return;
    }
    let cancelled = false;
    void backend.getMySeats().then((data) => {
      if (!cancelled) setSeats(data);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, user, profile?.leaderCount]);

  if (!user || !profile) {
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <Card className="p-8 text-center">
          <h1 className="font-display text-xl font-bold">Profil</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            İlerlemeni görmek için X hesabınla giriş yap.
          </p>
          <Button className="mt-5 w-full" onClick={() => setSignInOpen(true)}>
            <XLogo />
            Giriş yap
          </Button>
        </Card>
        <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
      </div>
    );
  }

  const hourlyXp = seats.length * XP_PER_LEADER_HOUR;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-5">
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar src={user.avatarUrl} handle={user.handle} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-extrabold tracking-tight">
              {profile.displayName}
            </h1>
            <a
              href={`https://x.com/${user.handle}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <XLogo className="size-3" />@{user.handle}
            </a>
          </div>
        </div>
        <LevelBadge xp={profile.xp} className="mt-5" />
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Vote} label="Kullanılan oy" value={formatNumber(profile.voteCount)} />
        <Stat icon={Crown} label="İl başkanlığı" value={formatNumber(profile.leaderCount)} />
        <Stat icon={Sparkles} label="Saatlik XP" value={`+${formatNumber(hourlyXp)}`} />
        <Stat
          icon={Timer}
          label="Sonraki oy"
          value={cooldown > 0 ? formatDuration(cooldown) : "hazır"}
        />
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold tracking-[-0.02em]">
              Kendi partin
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Haftalık {formatUsd(PARTY_WEEKLY_PRICE)} — 81 ilin pusulasına gir, haritayı kendi
              renginle boya.
            </p>
          </div>
          <Button variant="primary" onClick={() => setPartyOpen(true)}>
            <Sparkles />
            Parti kur
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display text-base font-semibold tracking-[-0.02em]">
          İl başkanlıklarım
        </h2>
        {seats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Henüz bir koltuğun yok. Haritadan bir il seç, sevdiğin partinin il başkanlığını{" "}
            {formatUsd(1)}'dan başlayan fiyatla kap.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {seats.map((seat) => {
              const province = PROVINCE_BY_ID[seat.provinceId];
              const party = PARTY_BY_ID[seat.partyId];
              return (
                <li key={`${seat.provinceId}-${seat.partyId}`}>
                  <Link
                    to={`/il/${seat.provinceId}`}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/[0.06]"
                  >
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-black"
                      style={{ background: partyColor(seat.partyId), color: partyTextColor(seat.partyId) }}
                    >
                      {party?.name.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{province?.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {party?.name} il başkanı
                        {seat.heldSince && ` · ${formatSince(seat.heldSince)} önce alındı`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm font-bold">{formatUsd(seat.price)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        devralma {formatUsd(seat.nextPrice)}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <CreatePartyDialog open={partyOpen} onOpenChange={setPartyOpen} />
    </div>
  );
}
