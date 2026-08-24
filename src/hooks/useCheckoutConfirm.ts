import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useGame } from "@/backend/GameProvider";

/**
 * Stripe'tan dönen kullanıcının hakkını doğrulayıp işler.
 *
 * NEDEN VAR
 *
 * Ödeme yalnızca webhook'a bağlıydı. Stripe uç noktası yanlış kurulduysa ya
 * da bir olay düştüyse kullanıcı parayı ödüyor, hakkı hiç gelmiyor ve kimse
 * fark etmiyordu. Burası ikinci bağımsız yol: dönüş adresindeki Stripe oturum
 * kimliği sunucuya gönderiliyor, sunucu Stripe'a sorup ödemeyi doğruluyor ve
 * hakkı veriyor.
 *
 * Hak yine istemcinin söylediğine göre değil Stripe'ın söylediğine göre
 * veriliyor; buradan giden tek şey oturum kimliği. Aynı oturumun iki kez
 * işlenmesi de zararsız — koltuk alımı oturum kimliğiyle bir kez işleniyor,
 * abonelik tarihi geriye gitmiyor.
 */
const MESAJ: Record<string, string> = {
  fast_votes: "Hızlı oy aboneliğin açıldı: artık 15 saniyede bir oy kullanabilirsin.",
  custom_party: "Partin kuruldu! Artık haritada oy alabilir.",
  seat: "İl başkanlığı senin!",
};

export function useCheckoutConfirm() {
  const { backend, refreshProfile, refresh } = useGame();
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("session_id");
  const islenen = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    // StrictMode etkisi iki kez çalıştırıyor; aynı oturumu bir kez işle.
    if (islenen.current === sessionId) return;
    islenen.current = sessionId;

    const temizle = () => {
      const next = new URLSearchParams(params);
      next.delete("session_id");
      setParams(next, { replace: true });
    };

    void (async () => {
      try {
        const sonuc = await backend.confirmCheckout(sessionId);
        if (sonuc.ok) {
          toast.success(MESAJ[sonuc.kind ?? ""] ?? "Ödemen hesabına işlendi.");
          await Promise.all([refreshProfile(), refresh()]);
        } else if (sonuc.message) {
          /*
           * Sessiz kalma. Ödeme alınıp hak gelmediğinde kullanıcının bunu
           * fark etmesi gerekiyor — asıl hata buydu.
           */
          toast.error(`Ödemen işlenemedi: ${sonuc.message}`, { duration: 12000 });
        }
      } catch (err) {
        toast.error(
          `Ödemen işlenemedi: ${err instanceof Error ? err.message : "bilinmeyen hata"}`,
          { duration: 12000 },
        );
      } finally {
        temizle();
      }
    })();
    // params/setParams her gezinmede değişiyor; tetikleyici yalnızca oturum kimliği.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
}
