import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useGame } from "@/backend/GameProvider";

const ANAHTAR = "partim.lol/giris-donus";

/**
 * Google dönüşünü karşılar.
 *
 * Dönüş adresi hash taşıyamıyor (yoksa Supabase'in eklediği `?code=` hash'in
 * içine düşüyor ve hiç okunmuyor), bu yüzden kullanıcı hep kök adrese
 * dönüyor. Girişten önce bulunduğu sayfayı saklıyoruz; oturum kurulunca onu
 * geri veriyoruz ve karşılandığını söylüyoruz.
 */
export function useAuthReturn() {
  const { signedIn, user } = useGame();
  const navigate = useNavigate();
  const islendi = useRef(false);

  useEffect(() => {
    if (!signedIn || islendi.current) return;

    let hedef: string | null = null;
    try {
      hedef = sessionStorage.getItem(ANAHTAR);
      if (hedef) sessionStorage.removeItem(ANAHTAR);
    } catch {
      /* depolama kapalı olabilir */
    }
    if (!hedef) return;

    islendi.current = true;
    toast.success(`Hoş geldin${user?.handle ? `, @${user.handle}` : ""}!`);

    // "#/profil" → "/profil"
    const yol = hedef.replace(/^#/, "");
    if (yol && yol !== window.location.hash.replace(/^#/, "")) {
      navigate(yol, { replace: true });
    }
  }, [signedIn, user?.handle, navigate]);
}
