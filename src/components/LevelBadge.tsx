import { Progress } from "@/components/ui/progress";
import { formatNumber, levelProgress } from "@/lib/game";
import { cn } from "@/lib/utils";

export function LevelBadge({ xp, className, compact }: { xp: number; className?: string; compact?: boolean }) {
  const { level, current, needed, ratio, title } = levelProgress(xp);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="grid size-8 place-items-center rounded-lg bg-primary/15 font-display text-sm font-bold text-primary">
          {level}
        </span>
        <div className="min-w-[92px]">
          <div className="text-[11px] font-semibold leading-none">{title}</div>
          <Progress value={ratio * 100} className="mt-1.5 h-1" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-end justify-between">
        <div>
          <div className="stat-label">Seviye {level}</div>
          <div className="font-display text-lg font-bold">{title}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className="font-mono text-sm font-semibold text-foreground">{formatNumber(xp)} XP</div>
          <div>
            sonraki seviyeye {formatNumber(needed - current)} XP
          </div>
        </div>
      </div>
      <Progress value={ratio * 100} />
    </div>
  );
}
