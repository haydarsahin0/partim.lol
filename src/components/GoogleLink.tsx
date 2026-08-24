/**
 * Hesabı Google'a bağlama kartı.
 *
 * Hesaplar cihaza bağlıydı: tarayıcı verisi silinince ya da kullanıcı başka
 * cihaza geçince hesap ve satın alımları geride kalıyordu. Kurtarma kodu vardı
 * ama kimse kodunu saklamıyor. Bağlandıktan sonra aynı Google hesabıyla
 * nereden girilirse girilsin aynı profil açılıyor.
 */
import { useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Google'ın kendi işareti; metinle anlatmak yerine tanınan biçim. */
function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2.2 20.4 2.2 24s.8 6.9 2.3 9.9l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"
      />
    </svg>
  );
}

export function GoogleLink() {
  const { profile, isDemo, signInWithGoogle } = useGame();
  const [busy, setBusy] = useState(false);

  const bagli = !!profile?.linkedProvider;

  const bagla = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } finally {
      setBusy(false);
    }
  };

  if (bagli) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 font-display text-base font-semibold tracking-[-0.02em]">
              Hesabın Google'a bağlı
              <Check className="size-4 text-emerald-300" />
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Tarayıcı verini silsen ya da başka bir cihaza geçsen bile aynı Google hesabıyla
              girdiğinde bu profile — oyların, il başkanlıkların ve aboneliklerin — geri dönersin.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold tracking-[-0.02em]">
            Hesabını kaybetme
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Şu an hesabın yalnızca bu tarayıcıya bağlı. Google ile bağlarsan başka bir cihazdan
            da aynı hesaba girersin; satın aldığın{" "}
            <strong className="text-foreground">il başkanlıkları ve abonelikler</strong> seninle
            gelir.
            {isDemo && " (Demo modda bağlantı yalnızca gösterim amaçlı.)"}
          </p>
        </div>
        <Button variant="default" onClick={() => void bagla()} disabled={busy} className="shrink-0">
          {busy ? <Loader2 className="animate-spin" /> : <GoogleG className="size-4" />}
          Google ile bağla
        </Button>
      </div>
    </Card>
  );
}
