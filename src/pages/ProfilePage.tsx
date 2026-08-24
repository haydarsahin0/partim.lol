import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Sparkles, Timer, Vote } from "lucide-react";
import { CreatePartyDialog } from "@/components/CreatePartyDialog";
import { ProfileEditor } from "@/components/ProfileEditor";
import { GoogleLink } from "@/components/GoogleLink";
import { GoogleG } from "@/components/GoogleG";
import { PartyMark } from "@/components/PartyMark";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import type { LeaderSeat } from "@/backend/types";
import { PARTY_BY_ID } from "@/data/parties";
import { PROVINCE_BY_ID } from "@/data/provinces";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LevelBadge } from "@/components/LevelBadge";
import {
  PARTY_WEEKLY_PRICE,
  hasUnlimitedVotes,
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
  const { backend, user, profile, requireAuth, ready } = useGame();
  const [seats, setSeats] = useState<LeaderSeat[]>([]);
  const [partyOpen, setPartyOpen] = useState(false);
  const unlimited = hasUnlimitedVotes(profile);
  const cooldown = useCountdown(unlimited ? null : profile?.nextVoteAt);

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

  // Oturum yükleniyor olabilir; profil de hazır değilse iskelet göster.
  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-5">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // Hesap artık kendiliğinden açılmıyor: profil sayfası girişe çağırıyor.
  if (!user || !profile) {
    return (
      <div className="mx-auto w-full max-w-3xl p-3 sm:p-5">
        <Card className="p-6 text-center">
          <h1 className="font-display text-xl font-bold tracking-[-0.02em]">
            Önce giriş yap
          </h1>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Profilin, oyların, il başkanlıkların ve aboneliklerin Google hesabına bağlanıyor.
            Böylece tarayıcı verini silsen ya da telefondan girsen de her şeyin yerinde kalıyor.
          </p>
          <Button
            size="lg"
            className="mt-4"
            onClick={() => requireAuth("Profilini görmek için giriş yap.")}
          >
            <GoogleG className="size-4" />
            Google ile giriş yap
          </Button>
        </Card>
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
            <span className="text-sm text-muted-foreground">@{user.handle}</span>
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
          value={unlimited ? "sınırsız" : cooldown > 0 ? formatDuration(cooldown) : "hazır"}
        />
      </div>

      <GoogleLink />

      <ProfileEditor />

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
          <Button
            variant="primary"
            onClick={() => {
              if (!requireAuth("Partini hesabına bağlayabilmemiz için önce giriş yap.")) return;
              setPartyOpen(true);
            }}
          >
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
                    <PartyMark partyId={seat.partyId} size={32} className="rounded-lg" />
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
