import { useEffect, useState } from "react";
import { Crown, Trophy, Vote } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import type { LeaderboardEntry } from "@/backend/types";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, levelTitle } from "@/lib/game";
import { cn } from "@/lib/utils";

const MEDALS = ["text-amber-300", "text-slate-300", "text-orange-400"];

export default function LeaderboardPage() {
  const { backend, user } = useGame();
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void backend.getLeaderboard(50).then((data) => {
      if (!cancelled) setRows(data);
    });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Sıralama</h1>
        <p className="text-sm text-muted-foreground">
          XP'ye göre ilk 50 oyuncu. Oy başına 1 XP, il başkanlığında geçirilen her saat 20 XP.
        </p>
      </div>

      <Card className="p-2 sm:p-3">
        {!rows ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Henüz kimse oynamamış.</p>
        ) : (
          <ol className="space-y-1">
            {rows.map((row, index) => {
              const mine = user?.id === row.user.id;
              return (
                <li
                  key={row.user.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5",
                    mine ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-white/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "w-7 shrink-0 text-center font-display text-sm font-bold",
                      MEDALS[index] ?? "text-muted-foreground",
                    )}
                  >
                    {index < 3 ? <Trophy className="mx-auto size-4" /> : index + 1}
                  </span>
                  <Avatar src={row.user.avatarUrl} handle={row.user.handle} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">
                      {row.user.displayName}
                      {mine && <span className="ml-1.5 text-xs text-primary">(sen)</span>}
                      {row.user.isBot && (
                        <span className="ml-1.5 align-middle text-[10px] font-semibold text-muted-foreground">
                          bot
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      @{row.user.handle} · Sv.{row.level} {levelTitle(row.level)}
                    </div>
                  </div>
                  <div className="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
                    <span className="flex items-center gap-1">
                      <Vote className="size-3.5" />
                      {formatNumber(row.voteCount)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Crown className="size-3.5" />
                      {row.leaderCount}
                    </span>
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono text-sm font-bold tabular-nums">
                    {formatNumber(row.xp)} XP
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
