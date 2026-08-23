/**
 * Cihaz kimliği.
 *
 * Oyunda giriş ekranı yok: ilk ziyarette hesap kendiliğinden açılıyor ve
 * cihazda saklanan kimlikle hatırlanıyor. Bu dosya o kimliği üretir.
 *
 * İki ayrı şey var ve karıştırılmamalı:
 *
 *   deviceId   Rastgele üretilmiş, yalnızca bu tarayıcıya ait kimlik. Hesabın
 *              gerçek bağı budur. localStorage'da durur.
 *
 *   deviceHash Ekran, saat dilimi, dil gibi kaba özelliklerden türetilen zayıf
 *              bir imza. KİMLİK DEĞİLDİR — aynı model telefonu aynı ülkede
 *              kullanan iki farklı kişi aynı imzayı üretebilir. Bu yüzden asla
 *              "aynı imza = aynı kişi" varsayılmaz; yalnızca kısa sürede çok
 *              sayıda hesap açılmasını yavaşlatmak için sayaç anahtarı olarak
 *              kullanılır.
 */

const KEY = "partim.lol/device/v1";

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

/** Bu tarayıcının kimliğini döner; yoksa üretip saklar. */
export function getDeviceIdentity(): DeviceIdentity {
  if (cached) return cached;

  const existing = readStored();
  if (existing) {
    cached = { deviceId: existing, deviceHash: computeDeviceHash(), persisted: true };
    return cached;
  }

  const deviceId = randomId();
  const persisted = writeStored(deviceId);
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
