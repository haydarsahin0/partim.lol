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
import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
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
import { adresiKopyala, platform, tarayicidaAc, uygulamaIciTarayici } from "@/lib/tarayici";

const FAYDALAR = [
  "Oyların, il başkanlıkların ve aboneliklerin hesabına yazılır",
  "Tarayıcı verini silsen de, telefondan girsen de aynı hesap",
  "Sıralamada kendi adınla yer alırsın",
];

export function SignInDialog() {
  const { girisSebebi, girisKapat, signInWithGoogle } = useGame();
  const [busy, setBusy] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);

  /*
   * Tespit bir kez yapılıyor: user-agent oturum boyunca değişmiyor ve her
   * açılışta yeniden hesaplamanın anlamı yok.
   */
  const gomulu = useMemo(uygulamaIciTarayici, []);
  const cihaz = useMemo(platform, []);

  const gir = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } finally {
      setBusy(false);
    }
  };

  const kopyala = async () => {
    if (await adresiKopyala()) {
      setKopyalandi(true);
      window.setTimeout(() => setKopyalandi(false), 2500);
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

        {/*
          UYGULAMA İÇİ TARAYICI.

          X'ten (ya da Instagram, TikTok…) gelen bağlantı uygulamanın kendi
          tarayıcısında açılıyor ve Google, OAuth'u gömülü tarayıcılarda
          engelliyor. Bunu burada çözmenin yolu yok — kullanıcıyı gerçek
          tarayıcıya çıkarmak gerekiyor.

          Google düğmesi yine de duruyor, altta: tespit user-agent'a dayanıyor
          ve kesin değil. Yanlış tespit ettiysek kullanıcının yolunu kapatmış
          olmayalım.
        */}
        {gomulu && (
          <div className="space-y-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
            <p className="text-[13px] font-semibold text-amber-200">
              Bu sayfa uygulama içi tarayıcıda açık
            </p>
            <p className="text-[12px] leading-relaxed text-amber-200/85">
              Google, güvenlik nedeniyle bu tarayıcıda giriş yapılmasına izin vermiyor.
              Tek bir adım gerekiyor: sayfayı normal tarayıcında aç, giriş orada çalışıyor.
            </p>

            <Button size="lg" variant="primary" className="w-full" onClick={tarayicidaAc}>
              <ExternalLink className="size-4" />
              {cihaz === "ios" ? "Safari'de aç" : "Tarayıcıda aç"}
            </Button>

            {/*
              iOS'ta programla Safari'ye çıkmanın garantili yolu yok; düğme
              çalışmazsa kullanıcı elle yapabilsin diye adım yazılı.
            */}
            <p className="text-[12px] leading-relaxed text-amber-200/70">
              {cihaz === "ios" ? (
                <>
                  Açılmazsa: sağ alttaki <strong>⋯</strong> menüsünden{" "}
                  <strong>Safari'de Aç</strong>.
                </>
              ) : (
                <>
                  Açılmazsa: sağ üstteki <strong>⋮</strong> menüsünden{" "}
                  <strong>Tarayıcıda aç</strong>.
                </>
              )}
            </p>

            <button
              type="button"
              onClick={() => void kopyala()}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-200/80 underline decoration-amber-200/30 underline-offset-4 transition-colors hover:text-amber-100"
            >
              {kopyalandi ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {kopyalandi ? "Bağlantı kopyalandı" : "Bağlantıyı kopyala"}
            </button>
          </div>
        )}

        <Button
          size="lg"
          className="w-full"
          variant={gomulu ? "secondary" : "default"}
          onClick={() => void gir()}
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : <GoogleG className="size-4" />}
          {gomulu ? "Yine de burada dene" : "Google ile devam et"}
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          Yalnızca adın ve e-postan alınır; e-posta adresin hiçbir yerde başkalarına
          gösterilmez. Oyun bir siyaset simülasyonudur, hiçbir partiyle bağlantısı yoktur.
        </p>
      </DialogContent>
    </Dialog>
  );
}
