import { Link, NavLink } from "react-router-dom";
import { Crown, Map as MapIcon, Trophy, User } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GoogleG } from "@/components/GoogleG";
import { Badge } from "@/components/ui/badge";
import { LevelBadge } from "@/components/LevelBadge";
import { Wordmark } from "@/components/Logo";
import { NationalBar } from "@/components/NationalBar";
import { formatDuration, hasUnlimitedVotes } from "@/lib/game";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Harita", icon: MapIcon },
  { to: "/siralama", label: "Sıralama", icon: Trophy },
  { to: "/profil", label: "Profil", icon: User },
];

/**
 * Başlık.
 *
 * Kenardan kenara uzanan, altında çizgisi olan klasik çubuk yerine sayfanın
 * üstünde yüzen buğulu bir cam levha: arka plandaki shader camın ardından
 * geçiyor, kenar çizgisi yerine kenarları ışıklandırıyor.
 *
 * İçinde Türkiye geneli oy dağılımı da var — oyunun anlık durumu artık her
 * sayfada, katlamanın üstünde. Masaüstünde başlıkla aynı satırda, dar ekranda
 * altına iniyor.
 */
export function Header() {
  const { user, profile, isDemo, requireAuth } = useGame();
  const unlimited = hasUnlimitedVotes(profile);
  const cooldown = useCountdown(unlimited ? null : profile?.nextVoteAt);

  return (
    <div className="sticky top-0 z-30 px-2 pt-2 sm:px-3 sm:pt-3">
      <header className="glass mx-auto w-full max-w-[1800px] px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-3">
          <Link to="/" aria-label="partim.lol ana sayfa" className="shrink-0">
            <Wordmark className="flex items-center gap-2" />
          </Link>

          <nav className="flex shrink-0 items-center gap-0.5">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition-colors sm:px-3",
                    isActive
                      ? "bg-white/[0.11] text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
                  )
                }
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Geniş ekranda dağılım başlıkla aynı satırda, ortada. */}
          <NationalBar showTotal={false} className="mx-2 hidden min-w-0 flex-1 lg:block" />

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
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

            {user ? (
              <Link to="/profil" className="flex items-center gap-2">
                <Avatar src={user.avatarUrl} handle={user.handle} size={32} />
                <span className="hidden text-sm font-semibold sm:block">@{user.handle}</span>
              </Link>
            ) : (
              /* Hesap kendiliğinden açılmıyor; giriş her sayfadan bir tık uzakta. */
              <Button
                size="sm"
                onClick={() => requireAuth("Oynamaya başlamak için giriş yap.")}
              >
                <GoogleG className="size-4" />
                <span className="hidden sm:inline">Google ile giriş</span>
                <span className="sm:hidden">Giriş</span>
              </Button>
            )}
          </div>
        </div>

        {/* Dar ekranda dağılım kendi satırında; şerit tam genişliği kullanır. */}
        <NationalBar className="mt-2.5 border-t border-white/[0.06] pt-2.5 lg:hidden" />

        {isDemo && (
          <div className="mt-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.07] px-3 py-1 text-center text-[11px] font-medium text-amber-200/90">
            Demo mod — veriler bu tarayıcıda tutulur, ödeme alınmaz.{" "}
            <Link to="/nasil-oynanir" className="underline underline-offset-2">
              Nasıl gerçek moda geçilir?
            </Link>
          </div>
        )}
      </header>
    </div>
  );
}
