import { Link, NavLink } from "react-router-dom";
import { Crown, Map as MapIcon, Trophy, User } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LevelBadge } from "@/components/LevelBadge";
import { Wordmark } from "@/components/Logo";
import { formatDuration, formatNumber, hasUnlimitedVotes } from "@/lib/game";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Harita", icon: MapIcon },
  { to: "/siralama", label: "Sıralama", icon: Trophy },
  { to: "/profil", label: "Profil", icon: User },
];

export function Header() {
  const { user, profile, isDemo, totalVotes } = useGame();
  const unlimited = hasUnlimitedVotes(profile);
  const cooldown = useCountdown(unlimited ? null : profile?.nextVoteAt);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[hsl(225_45%_4%_/_0.72)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1800px] items-center gap-3 px-3 sm:px-5">
        <Link to="/" aria-label="partim.lol ana sayfa">
          <Wordmark className="flex items-center gap-2" />
        </Link>

        <nav className="ml-1 flex items-center gap-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors sm:px-3",
                  isActive ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden text-right lg:block">
            <div className="stat-label">Toplam oy</div>
            <div className="font-mono text-sm font-bold">{formatNumber(totalVotes)}</div>
          </div>

          {profile && (
            <>
              <Badge
                variant={!unlimited && cooldown > 0 ? "warning" : "success"}
                className="hidden font-mono sm:inline-flex"
                title={cooldown > 0 ? "Sonraki oy hakkına kalan süre" : "Oy hakkın hazır"}
              >
                {unlimited ? "SINIRSIZ" : cooldown > 0 ? formatDuration(cooldown) : "OY HAZIR"}
              </Badge>
              {profile.leaderCount > 0 && (
                <Badge variant="secondary" className="hidden md:inline-flex">
                  <Crown className="size-3" />
                  {profile.leaderCount} başkanlık
                </Badge>
              )}
              <LevelBadge xp={profile.xp} compact className="hidden md:flex" />
            </>
          )}

          {user && (
            <Link to="/profil" className="flex items-center gap-2">
              <Avatar src={user.avatarUrl} handle={user.handle} size={34} />
              <span className="hidden text-sm font-semibold sm:block">@{user.handle}</span>
            </Link>
          )}
        </div>
      </div>

      {isDemo && (
        <div className="border-t border-amber-400/15 bg-amber-400/[0.07] px-4 py-1 text-center text-[11px] font-medium text-amber-200/90">
          Demo mod — veriler bu tarayıcıda tutulur, ödeme alınmaz.{" "}
          <Link to="/nasil-oynanir" className="underline underline-offset-2">
            Nasıl gerçek moda geçilir?
          </Link>
        </div>
      )}

    </header>
  );
}
