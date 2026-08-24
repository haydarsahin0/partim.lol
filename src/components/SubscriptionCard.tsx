/**
 * Abonelik durumu.
 *
 * Ödeme yapan kullanıcının aboneliğinin ne durumda olduğunu görebileceği tek
 * yer burasıydı ve yoktu: hakkın ne zaman biteceği, ne zaman yenileneceği,
 * hangi hesaba bağlı olduğu hiçbir yerde yazmıyordu. Ödeme alan bir üründe bu
 * bilginin görünmemesi kabul edilebilir değil.
 */
import { Zap } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FAST_VOTE_COOLDOWN_LABEL,
  formatDuration,
  formatSince,
  hasFastVotes,
} from "@/lib/game";

const tarih = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function SubscriptionCard() {
  const { profile } = useGame();
  const kalan = useCountdown(profile?.fastVotesUntil);

  if (!profile || !hasFastVotes(profile)) return null;

  const biter = profile.fastVotesUntil ? new Date(profile.fastVotesUntil) : null;

  /*
   * Günlük abonelik: dönem sonu aynı zamanda bir sonraki tahsilat anı.
   * Ölçek kalan süreye göre — yeni alınmış bir abonelikte "23:59:40" yazmak
   * bilgi değil gürültü; son bir saatte ise gün/saat çok kaba kalıyor.
   */
  const kalanMetin =
    kalan >= 2 * 86_400_000
      ? `${Math.round(kalan / 86_400_000)} gün`
      : kalan >= 3_600_000
        ? `${Math.round(kalan / 3_600_000)} saat`
        : formatDuration(kalan);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-300/15 text-amber-300">
            <Zap className="size-5 fill-current" />
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-display text-base font-semibold tracking-[-0.02em]">
              Hızlı oy
              <Badge variant="success">etkin</Badge>
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {FAST_VOTE_COOLDOWN_LABEL}. Günlük abonelik, Google hesabına bağlı — başka bir
              cihazdan girsen de geçerli.
            </p>
          </div>
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-2 text-right sm:gap-3">
          <div className="glass-soft px-3 py-2">
            <dt className="stat-label">kalan</dt>
            <dd className="mt-0.5 font-mono text-sm font-bold tabular-nums">{kalanMetin}</dd>
          </div>
          <div className="glass-soft px-3 py-2">
            <dt className="stat-label">yenilenir</dt>
            <dd className="mt-0.5 font-mono text-sm font-bold tabular-nums">
              {biter ? tarih.format(biter) : "—"}
            </dd>
          </div>
        </dl>
      </div>

      {profile.fastVotesSince && (
        <p className="mt-3 border-t border-white/[0.08] pt-2.5 text-[12px] text-muted-foreground">
          {formatSince(profile.fastVotesSince)} önce başladı. İptal etmek için Stripe'tan gelen
          makbuz e-postasındaki bağlantıyı kullanabilirsin; iptal edince kalan süren dolana kadar
          hakkın sürer.
        </p>
      )}
    </Card>
  );
}
