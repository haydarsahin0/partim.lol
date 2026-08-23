/**
 * Cihaz kimliği.
 *
 * Oyunda giriş ekranı yok: ilk ziyarette hesap kendiliğinden açılıyor ve
 * cihazda saklanan kimlikle hatırlanıyor. Bu dosya o kimliği üretir.
 *
 * İki ayrı şey var ve karıştırılmamalı:
 *
 *   deviceId   Rastgele üretilmiş, yalnızca bu tarayıcıya ait kimlik. Hesabın
 *              gerçek bağı budur.
 *
 *   deviceHash Ekran, saat dilimi, dil gibi kaba özelliklerden türetilen zayıf
 *              bir imza. KİMLİK DEĞİLDİR — aynı model telefonu aynı ülkede
 *              kullanan iki farklı kişi aynı imzayı üretebilir. Bu yüzden asla
 *              "aynı imza = aynı kişi" varsayılmaz; yalnızca kısa sürede çok
 *              sayıda hesap açılmasını yavaşlatmak için sayaç anahtarı olarak
 *              kullanılır.
 *
 * Kimlik NEDEN İKİ YERDE SAKLANIYOR
 *
 * Tek başına localStorage yetmiyor, çünkü:
 *
 *   - localStorage köken (origin) başına ayrı. `www.partim.lol` ile
 *     `partim.lol` iki ayrı kutu; kullanıcı ikisi arasında gidip geldiğinde
 *     hesabı değişmiş gibi görünüyordu. Çerezi kayıtlı alan adına
 *     (`.partim.lol`) yazınca ikisi aynı kimliği paylaşıyor.
 *   - Safari (ITP) betikle yazılan depoyu, siteye bir süre girilmezse
 *     siliyor. Çerez ve localStorage aynı anda nadiren gider; hangisi
 *     kalırsa diğerini onarıyor.
 *
 * Bu yüzden okuma sırası: localStorage → çerez → yeni üret. Hangi kaynaktan
 * gelirse gelsin, değer her açılışta ikisine birden geri yazılır.
 */

const KEY = "partim.lol/device/v1";
const COOKIE = "partim_device";
/** ~10 yıl. Tarayıcılar bunu kısaltabilir; kısaltırsa localStorage devreye girer. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 3650;

export type DeviceIdentity = {
  deviceId: string;
  deviceHash: string;
  /** Kimlik kalıcı olarak saklanabildi mi? (gizli sekmede false olabilir) */
  persisted: boolean;
};

let cached: DeviceIdentity | null = null;

/** crypto varsa onu kullan; yoksa Math.random ile doldur. */
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const webCrypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function randomId(): string {
  const webCrypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  return [...randomBytes(16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** FNV-1a — kısa, bağımlılıksız, kriptografik olmayan özet */
function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Kaba cihaz imzası. Bilerek düşük çözünürlüklü: parmak izi çıkarıp kullanıcıyı
 * siteler arası takip etmek amacı yok, yalnızca "aynı tarayıcıdan arka arkaya
 * hesap açma" davranışını saymak istiyoruz.
 */
function computeDeviceHash(): string {
  if (typeof window === "undefined") return "sunucu";
  const parts = [
    screen.width,
    screen.height,
    Math.round(window.devicePixelRatio || 1),
    new Intl.DateTimeFormat().resolvedOptions().timeZone ?? "?",
    navigator.language,
    navigator.hardwareConcurrency ?? 0,
    // Platform ipucu; tarayıcılar bunu giderek daha da kabalaştırıyor.
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      "?",
  ];
  return hash(parts.join("|"));
}

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string): boolean {
  try {
    localStorage.setItem(KEY, value);
    return true;
  } catch {
    return false;
  }
}

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== COOKIE) continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    return value.length >= 8 ? value : null;
  }
  return null;
}

/**
 * Çerezin yazılabileceği en geniş alan adı — son iki etiket:
 * `www.partim.lol` ve `partim.lol` için ikisinde de `.partim.lol`. Apex'ten de
 * bu kapsamla yazmak şart, yoksa çerez yalnızca apex'e ait olur ve `www`
 * alt alan adı onu göremez; kullanıcı ikisi arasında gidip geldiğinde hesabı
 * değişmiş gibi görünür.
 *
 * `localhost`, IP adresleri ve `kullanici.github.io` gibi genel son ekler
 * (public suffix) için bu kapsam geçersizdir; tarayıcı çerezi sessizce yok
 * sayar. Bu yüzden yazan taraf geri okuyup doğruluyor ve tutmadıysa dar
 * kapsama düşüyor (bkz. writeCookie).
 */
function cookieDomain(): string | null {
  const host = location.hostname;
  if (!host || host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":")) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  return `.${labels.slice(-2).join(".")}`;
}

function writeCookie(value: string): boolean {
  if (typeof document === "undefined") return false;
  const base =
    `${COOKIE}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax` +
    (location.protocol === "https:" ? "; Secure" : "");

  // Önce kayıtlı alan adına yaz; tarayıcı reddederse (genel son ek listesi)
  // kökene yazmaya düş.
  const domain = cookieDomain();
  if (domain) {
    try {
      document.cookie = `${base}; Domain=${domain}`;
    } catch {
      /* aşağıdaki dar kapsamlı yazma denenecek */
    }
    if (readCookie() === value) return true;
  }
  try {
    document.cookie = base;
  } catch {
    return false;
  }
  return readCookie() === value;
}

/** Değeri iki depoya da yazar; en az biri tuttuysa kalıcı sayılır. */
function persist(value: string): boolean {
  const inStorage = writeStored(value);
  const inCookie = writeCookie(value);
  return inStorage || inCookie;
}

/**
 * Bu tarayıcının kimliğini döner; yoksa üretip saklar.
 *
 * Var olan kimlik hangi depodan gelirse gelsin ikisine birden geri yazılır —
 * biri silinmişse diğerinden onarılmış olur.
 */
export function getDeviceIdentity(): DeviceIdentity {
  if (cached) return cached;

  const existing = readStored() ?? readCookie();
  if (existing) {
    persist(existing);
    cached = { deviceId: existing, deviceHash: computeDeviceHash(), persisted: true };
    return cached;
  }

  const deviceId = randomId();
  const persisted = persist(deviceId);
  cached = { deviceId, deviceHash: computeDeviceHash(), persisted };
  return cached;
}

/**
 * Kurtarma kodu: kullanıcı tarayıcı verisini silerse hesabını başka bir yerden
 * geri alabilsin diye. Okunabilir olsun diye karışabilecek harfler (0/O, 1/I)
 * alfabeden çıkarıldı.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRecoveryCode(): string {
  const raw = [...randomBytes(12)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
