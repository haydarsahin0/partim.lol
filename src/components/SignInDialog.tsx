/**
 * Giriş penceresi.
 *
 * Hesap artık kendiliğinden açılmıyor. Eskiden siteye giren herkese anonim bir
 * hesap ve rastgele bir kullanıcı adı ("oyuncu41273") veriliyordu; o hesap
 * yalnızca tarayıcıya bağlı olduğu için veri silinince ya da başka cihaza
 * geçilince oyunla birlikte satın alımlar da gidiyordu.
 *
 * Pencere kendiliğinden açılmıyor: kullanıcı oy vermeye, koltuk almaya ya da
 * parti kurmaya kalktığında çıkıyor. Haritayı gezmek için giriş gerekmiyor.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useGame } from "@/backend/GameProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GoogleG } from "@/components/GoogleG";

const FAYDALAR = [
  "Oyların, il başkanlıkların ve aboneliklerin hesabına yazılır",
  "Tarayıcı verini silsen de, telefondan girsen de aynı hesap",
  "Sıralamada kendi adınla yer alırsın",
];

export function SignInDialog() {
  const { girisSebebi, girisKapat, signInWithGoogle } = useGame();
  const [busy, setBusy] = useState(false);

  const gir = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={girisSebebi !== null} onOpenChange={(acik) => !acik && girisKapat()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Google ile giriş yap</DialogTitle>
          <DialogDescription>{girisSebebi}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[13px] leading-relaxed">
          {FAYDALAR.map((satir) => (
            <li key={satir} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
              />
              <span>{satir}</span>
            </li>
          ))}
        </ul>

        <Button size="lg" className="w-full" onClick={() => void gir()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <GoogleG className="size-4" />}
          Google ile devam et
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          Yalnızca adın ve e-postan alınır; e-posta adresin hiçbir yerde başkalarına
          gösterilmez. Oyun bir siyaset simülasyonudur, hiçbir partiyle bağlantısı yoktur.
        </p>
      </DialogContent>
    </Dialog>
  );
}
