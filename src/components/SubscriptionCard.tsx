/**
 * Abonelik durumu.
 *
 * Ödeme yapan kullanıcının aboneliğinin ne durumda olduğunu görebileceği tek
 * yer burasıydı ve yoktu: hakkın ne zaman biteceği, ne zaman yenileneceği,
 * hangi hesaba bağlı olduğu hiçbir yerde yazmıyordu. Ödeme alan bir üründe bu
 * bilginin görünmemesi kabul edilebilir değil.
 *
 * İPTAL DE BURADA — AMA ÖNE ÇIKMADAN
 *
 * İptalin tek yolu Stripe'ın gönderdiği makbuz e-postasındaki bağlantıydı;
 * e-postayı bulamayan kullanıcının elinde hiçbir yol kalmıyordu. Bırakmanın
 * yolu ürünün içinde olmalı — hem doğrusu bu hem de "iptal edemedim" diye
 * açılan kart itirazlarının önüne geçen tek şey bu.
 *
 * Ama ilk hâlinde iptal, kartın üzerinde duran tek eylemdi: aboneliğine bakmak
 * için gelen kullanıcı önünde "Aboneliği iptal et" buluyordu. Şimdi kartta
 * sessiz bir "Aboneliği yönet" var; iptal onun içinde, üstelik önce ne
 * kaybedileceğini gösteren bir adımın ardında ve sürdürme düğmesinin yanında
 * ikinci sırada duruyor.
 *
 * SINIR NEREDE
 *
 * Tıklama sayısı ARTMADI (önce de iki tıklamaydı) ve düğme hâlâ ilk bakışta
 * bulunabiliyor. İptali gizlemek ya da zorlaştırmak bilerek yapılmadı: bulamayan
 * kullanıcı vazgeçmiyor, kartından itiraz açıyor — bu hem ücretli hem de Stripe
 * hesabını riske atıyor. Ayrıca "iptal en az abonelik kadar kolay olmalı" hem
 * Stripe'ın hem de tüketici mevzuatının şartı. Değişen şey görsel ağırlık ve
 * çerçeveleme; erişilebilirlik değil.
 */
import { useState } from "react";
import { ArrowRight, ChevronDown, Loader2, Zap } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { useCountdown } from "@/hooks/useCountdown";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FAST_VOTE_COOLDOWN_LABEL,
  FAST_VOTE_COOLDOWN_MS,
  FAST_VOTE_MULTIPLIER,
  VOTE_COOLDOWN_MS,
  formatDuration,
  formatNumber,
  formatSince,
  hasFastVotes,
  shortDuration,
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
  /**
   * Yönetim paneli açık mı?
   *
   * İptal doğrudan kartta durmuyor; bu panelin içinde ve önce ne kaybedileceği
   * yazıyor. Panel aynı zamanda onay adımının kendisi: iptal geri alınabilir
   * olduğu için üstüne bir "emin misin?" daha koymak tıklama sayısını boşuna
   * artırırdı.
   */
  const [yonetAcik, setYonetAcik] = useState(false);
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
      setYonetAcik(false);
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
        Tek satırda tutulunca metin düğmelerin yanında ince bir sütuna sıkışıyor
        ve kart uzayıp gidiyordu — telefonda okunmuyordu.
      */}
      <div className="mt-3 flex flex-col gap-2.5 border-t border-white/[0.08] pt-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
        <p className="text-[12px] leading-relaxed text-muted-foreground sm:min-w-0 sm:flex-1">
          {iptalEdildi ? (
            <>
              Abonelik iptal edildi: senden yeni bir tahsilat yapılmayacak. Hızlı oy hakkın
              {biter ? ` ${tarih.format(biter)}` : " dönem sonunda"} bitiyor.
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
        ) : (
          /*
           * Sessiz bir bağlantı — çerçeve yok, rengi gövde metniyle aynı.
           * Aboneliğine bakmaya gelen kullanıcının önüne "iptal et" çıkmıyor;
           * ama arayan iki saniyede buluyor.
           */
          <button
            type="button"
            onClick={() => setYonetAcik((v) => !v)}
            aria-expanded={yonetAcik}
            className="inline-flex items-center gap-1 self-start text-[12px] font-medium text-muted-foreground underline decoration-white/20 underline-offset-4 transition-colors hover:text-foreground hover:decoration-white/50 sm:shrink-0 sm:self-auto"
          >
            Aboneliği yönet
            <ChevronDown
              className={cn("size-3.5 transition-transform", yonetAcik && "rotate-180")}
            />
          </button>
        )}
      </div>

      {/*
        Elde tutma adımı.

        İptale giden yol buradan geçiyor ve önce ne kaybedileceği yazıyor:
        bekleme süresi dört katına çıkıyor, aynı sürede dörtte bir oy. Sayılar
        oyunun kendi sabitlerinden türüyor; elle yazılsalardı bir gün süre
        değiştiğinde burada eski değer kalırdı.
      */}
      {yonetAcik && !iptalEdildi && (
        <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[13px] font-semibold">İptal edersen ne değişir?</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-lg bg-amber-300/12 px-2.5 py-1 font-mono font-bold text-amber-300">
              {shortDuration(FAST_VOTE_COOLDOWN_MS)}
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground" />
            <span className="rounded-lg bg-white/[0.06] px-2.5 py-1 font-mono font-bold text-muted-foreground">
              {shortDuration(VOTE_COOLDOWN_MS)}
            </span>
            <span className="text-muted-foreground">
              bekleme süresi — aynı sürede {FAST_VOTE_MULTIPLIER} kat az oy.
            </span>
          </div>

          <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
            {profile.voteCount > 0 && (
              <>Şu ana kadar {formatNumber(profile.voteCount)} oy kullandın. </>
            )}
            İptal edersen ödediğin dönemin sonuna kadar
            {biter ? ` (${tarih.format(biter)})` : ""} hızlı oy sende kalır; sonrasında tahsilat
            yapılmaz ve istediğin an geri alabilirsin.
          </p>

          <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="primary"
              size="sm"
              disabled={calisiyor}
              onClick={() => setYonetAcik(false)}
            >
              <Zap className="fill-current" />
              Aboneliğim sürsün
            </Button>
            {/*
              İkinci sırada ve sessiz: gerçekten iptal etmek isteyen buradan
              çıkıyor, kararsız olan sürdürme düğmesini görüyor.
            */}
            <button
              type="button"
              disabled={calisiyor}
              onClick={() => void uygula(true)}
              className="inline-flex items-center justify-center gap-1.5 self-start text-[12px] font-medium text-muted-foreground underline decoration-white/20 underline-offset-4 transition-colors hover:text-foreground hover:decoration-white/50 disabled:opacity-50 sm:self-auto"
            >
              {calisiyor && <Loader2 className="size-3.5 animate-spin" />}
              Yine de iptal et
            </button>
          </div>
        </div>
      )}

    </Card>
  );
}
