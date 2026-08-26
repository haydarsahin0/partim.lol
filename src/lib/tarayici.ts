/**
 * Uygulama içi tarayıcı tespiti.
 *
 * NEDEN GEREKLİ
 *
 * X'in (Twitter) mobil uygulamasındaki bağlantılar uygulamanın kendi
 * tarayıcısında açılıyor — iOS'ta WKWebView, Android'de WebView. Google,
 * güvenlik gerekçesiyle OAuth'u gömülü tarayıcılarda AÇIKÇA ENGELLİYOR
 * ("disallowed_useragent"). Yani X'ten gelen kullanıcı "Google ile giriş"e
 * bastığında hata sayfası görüyor ya da hiçbir şey olmuyor.
 *
 * Bunu uygulama içinde çözmenin yolu yok; Google'ın kararı bu. Yapılabilecek
 * tek şey kullanıcıyı gerçek tarayıcıya çıkarmak.
 *
 * TESPİT NEDEN KABA
 *
 * User-agent güvenilir bir kimlik değil, ipucu. Yanlış pozitifte kullanıcı
 * gereksiz bir adım görüyor (zararsız); yanlış negatifte zaten eskisi gibi
 * takılıyor. Bu yüzden tespit "kesin" değil "muhtemel" diye ele alınıyor ve
 * Google düğmesi hiçbir zaman gizlenmiyor — yalnızca yanına çıkış yolu ekleniyor.
 */

export type Platform = "ios" | "android" | "diger";

function ua(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

export function platform(): Platform {
  const s = ua();
  if (/iPhone|iPad|iPod/i.test(s)) return "ios";
  if (/Android/i.test(s)) return "android";
  return "diger";
}

/**
 * Bilinen uygulama içi tarayıcılar.
 *
 * X'in kendi işareti tutarlı değil: iOS'ta "Twitter" geçiyor, Android'de çoğu
 * zaman yalnızca "wv" (WebView) kalıyor. İkisine de bakıyoruz. Instagram,
 * Facebook, TikTok ve LinkedIn de aynı sorunu yaşatıyor; onlar da listede.
 */
export function uygulamaIciTarayici(): boolean {
  const s = ua();
  if (!s) return false;

  // Açıkça kendini tanıtanlar
  if (/\b(Twitter|TwitterAndroid)\b/i.test(s)) return true;
  if (/\b(FBAN|FBAV|FB_IAB|Instagram)\b/i.test(s)) return true;
  if (/\bBytedanceWebview|musical_ly|TikTok\b/i.test(s)) return true;
  if (/\bLinkedInApp\b/i.test(s)) return true;

  // Android WebView: "; wv)" işareti. Chrome Custom Tabs bunu taşımıyor.
  if (/Android/i.test(s) && /;\s*wv\)/i.test(s)) return true;

  /*
   * iOS gömülü tarayıcı: Safari motorunu kullanıyor ama "Safari/" ibaresi
   * taşımıyor. Kriter bu — Chrome (CriOS), Firefox (FxiOS) ve Edge (EdgiOS)
   * kendi işaretlerini taşıdığı için elenmiyor.
   */
  if (/iPhone|iPad|iPod/i.test(s) && !/Safari\//i.test(s) && !/CriOS|FxiOS|EdgiOS/i.test(s)) {
    return true;
  }

  return false;
}

/** Kullanıcının şu an bulunduğu tam adres. */
export function buAdres(): string {
  if (typeof window === "undefined") return "";
  return window.location.href;
}

/**
 * Gerçek tarayıcıda açmayı dener. Başarı garantisi YOK.
 *
 * Android'de `intent://` şeması WebView'den çıkıp Chrome'u açıyor; bu
 * güvenilir. iOS'ta böyle bir yol yok — `x-safari-https://` bazı uygulamalarda
 * çalışıyor, bazılarında sessizce yok sayılıyor. Bu yüzden çağıran taraf her
 * zaman elle yapılacak adımı da göstermeli.
 */
export function tarayicidaAc(): void {
  if (typeof window === "undefined") return;
  const adres = buAdres();

  if (platform() === "android") {
    const kalan = adres.replace(/^https?:\/\//, "");
    window.location.href = `intent://${kalan}#Intent;scheme=https;package=com.android.chrome;end`;
    return;
  }

  if (platform() === "ios") {
    window.location.href = `x-safari-${adres}`;
    return;
  }

  window.open(adres, "_blank", "noopener");
}

/** Adresi panoya kopyalar. Her yerde çalışan tek kaçış yolu bu. */
export async function adresiKopyala(): Promise<boolean> {
  const adres = buAdres();
  try {
    await navigator.clipboard.writeText(adres);
    return true;
  } catch {
    // Pano izni yoksa eski yönteme düş.
    try {
      const alan = document.createElement("textarea");
      alan.value = adres;
      alan.setAttribute("readonly", "");
      alan.style.position = "fixed";
      alan.style.opacity = "0";
      document.body.appendChild(alan);
      alan.select();
      const oldu = document.execCommand("copy");
      alan.remove();
      return oldu;
    } catch {
      return false;
    }
  }
}
