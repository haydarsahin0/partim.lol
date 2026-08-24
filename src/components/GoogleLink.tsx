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
import { GoogleG } from "@/components/GoogleG";

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
