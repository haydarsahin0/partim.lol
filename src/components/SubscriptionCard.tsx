/**
 * Abonelik durumu.
 *
 * Ödeme yapan kullanıcının aboneliğinin ne durumda olduğunu görebileceği tek
 * yer burasıydı ve yoktu: hakkın ne zaman biteceği, ne zaman yenileneceği,
 * hangi hesaba bağlı olduğu hiçbir yerde yazmıyordu. Ödeme alan bir üründe bu
 * bilginin görünmemesi kabul edilebilir değil.
 *
 * İPTAL DE BURADA
 *
 * İptalin tek yolu Stripe'ın gönderdiği makbuz e-postasındaki bağlantıydı;
 * e-postayı bulamayan kullanıcının elinde hiçbir yol kalmıyordu. Bırakmanın
 * yolu ürünün içinde olmalı — hem doğrusu bu hem de "iptal edemedim" diye
 * açılan kart itirazlarının önüne geçen tek şey bu.
 */
import { useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const { profile, cancelFastVotes } = useGame();
  const kalan = useCountdown(profile?.fastVotesUntil);
  /** İptal iki adımlı: "iptal et" düğmesi önce onay soruyor. */
  const [onayIstiyor, setOnayIstiyor] = useState(false);
  const [calisiyor, setCalisiyor] = useState(false);

  if (!profile || !hasFastVotes(profile)) return null;

  const biter = profile.fastVotesUntil ? new Date(profile.fastVotesUntil) : null;
  const iptalEdildi = !!profile.fastVotesCancelAt;

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

  const uygula = async (iptal: boolean) => {
    setCalisiyor(true);
    try {
      await cancelFastVotes(iptal);
      setOnayIstiyor(false);
    } finally {
      setCalisiyor(false);
    }
  };

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
              {iptalEdildi ? (
                <Badge variant="warning">iptal edildi</Badge>
              ) : (
                <Badge variant="success">etkin</Badge>
              )}
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
            {/* İptal edildiyse o tarih artık bir yenileme değil, bir bitiş. */}
            <dt className="stat-label">{iptalEdildi ? "biter" : "yenilenir"}</dt>
            <dd className="mt-0.5 font-mono text-sm font-bold tabular-nums">
              {biter ? tarih.format(biter) : "—"}
            </dd>
          </div>
        </dl>
      </div>

      {/*
        Dar ekranda ALT ALTA.
        Tek satırda tutulunca onay metni düğmelerin yanında ince bir sütuna
        sıkışıyor ve kart uzayıp gidiyordu — telefonda okunmuyordu.
      */}
      <div className="mt-3 flex flex-col gap-2.5 border-t border-white/[0.08] pt-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
        <p className="text-[12px] leading-relaxed text-muted-foreground sm:min-w-0 sm:flex-1">
          {iptalEdildi ? (
            <>
              Abonelik iptal edildi: senden yeni bir tahsilat yapılmayacak. Hızlı oy hakkın
              {biter ? ` ${tarih.format(biter)}` : " dönem sonunda"} bitiyor.
            </>
          ) : onayIstiyor ? (
            <>
              İptal edilsin mi? Ödediğin dönemin sonuna kadar
              {biter ? ` (${tarih.format(biter)})` : ""} hızlı oy sende kalır; sonrasında
              tahsilat yapılmaz. İstersen sonra geri alabilirsin.
            </>
          ) : (
            <>
              {profile.fastVotesSince ? `${formatSince(profile.fastVotesSince)} önce başladı. ` : ""}
              Her gün kendiliğinden yenileniyor.
            </>
          )}
        </p>

        {iptalEdildi ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-start sm:self-auto"
            disabled={calisiyor}
            onClick={() => void uygula(false)}
          >
            {calisiyor && <Loader2 className="animate-spin" />}
            İptali geri al
          </Button>
        ) : onayIstiyor ? (
          <div className="flex gap-2 sm:shrink-0">
            <Button
              variant="ghost"
              size="sm"
              disabled={calisiyor}
              onClick={() => setOnayIstiyor(false)}
            >
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={calisiyor}
              onClick={() => void uygula(true)}
            >
              {calisiyor && <Loader2 className="animate-spin" />}
              Evet, iptal et
            </Button>
          </div>
        ) : (
          /*
           * Sessiz bir düğme. Bırakma yolu görünür olmalı ama abonelikten
           * çıkmaya davet eden bir şey de olmamalı.
           */
          <button
            type="button"
            onClick={() => setOnayIstiyor(true)}
            className="self-start rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground sm:shrink-0 sm:self-auto"
          >
            Aboneliği iptal et
          </button>
        )}
      </div>
    </Card>
  );
}
