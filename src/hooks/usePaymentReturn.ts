import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useGame } from "@/backend/GameProvider";

/** Webhook'un koltuğu devretmesi birkaç saniye sürebilir; bu aralıklarla yoklarız. */
const POLL_DELAYS_MS = [800, 1200, 1600, 2000, 2500, 3000];

/**
 * Stripe Checkout dönüşünü karşılar.
 *
 * Ödeme onayı istemciye değil, `stripe-webhook` fonksiyonuna gider; kullanıcı
 * siteye webhook'tan önce dönebilir. Bu yüzden koltuk gerçekten devredilene
 * kadar kısa aralıklarla yokluyor, sonra adres çubuğunu temizliyoruz.
 */
export function usePaymentReturn(provinceId: string, onSettled: () => void) {
  const { backend, user, refreshProfile } = useGame();
  const [params, setParams] = useSearchParams();
  const status = params.get("odeme");
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!status) return;
    // Aynı dönüşü iki kez işleme (StrictMode çift çalıştırır).
    const key = `${provinceId}:${status}`;
    if (handled.current === key) return;
    handled.current = key;

    const clearParam = () => {
      const next = new URLSearchParams(params);
      next.delete("odeme");
      setParams(next, { replace: true });
    };

    if (status !== "basarili") {
      if (status === "iptal") toast("Ödeme iptal edildi, koltuk el değiştirmedi.");
      clearParam();
      return;
    }

    let cancelled = false;
    const toastId = toast.loading("Ödemen alındı, koltuk devrediliyor…");

    void (async () => {
      for (const delay of POLL_DELAYS_MS) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (cancelled) return;
        try {
          const detail = await backend.getProvinceDetail(provinceId);
          if (cancelled) return;
          const mine = detail.seats.find((seat) => seat.holder?.id === user?.id);
          if (mine) {
            toast.success("İl başkanlığı senin! Saat başı +20 XP kazanmaya başladın.", {
              id: toastId,
            });
            await refreshProfile();
            onSettled();
            clearParam();
            return;
          }
        } catch {
          // Ağ hatasında sonraki denemeye geç.
        }
      }
      if (cancelled) return;
      toast.info("Ödeme alındı. Koltuk birkaç saniye içinde görünecek, sayfayı yenileyebilirsin.", {
        id: toastId,
      });
      onSettled();
      clearParam();
    })();

    return () => {
      cancelled = true;
    };
    // params/setParams kasten bağımlılık dışı: her adres değişiminde yeniden
    // tetiklenmemeli, akışı `handled` bayrağı yönetiyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, provinceId, backend, user?.id, refreshProfile, onSettled]);
}
