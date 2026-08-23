import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Panelin "Data API" sayfası proje kökünü değil REST uç noktasını gösteriyor
 * (`https://<ref>.supabase.co/rest/v1/`). Bu değer olduğu gibi girilirse istemci
 * `.../rest/v1/auth/v1/authorize` gibi adresler kurar ve Supabase
 * `{"error":"requested path is invalid"}` döner — hata mesajı da sebebi
 * söylemediği için bulması zordur. O yüzden adresi burada normalleştiriyoruz.
 */
const SERVIS_EKI = /\/(rest|auth|storage|realtime|functions)\/v\d+$/i;

export function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  while (SERVIS_EKI.test(url)) {
    url = url.replace(SERVIS_EKI, "");
  }
  return url;
}

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const url = rawUrl ? normalizeSupabaseUrl(rawUrl) : undefined;

if (rawUrl && url && rawUrl.trim() !== url) {
  console.warn(
    `[partim.lol] VITE_SUPABASE_URL proje kökü olmalı. "${rawUrl}" yerine "${url}" kullanılıyor.`,
  );
}

/** Ortam değişkenleri tanımlıysa gerçek arka uç kullanılabilir demektir. */
export const hasSupabaseConfig = Boolean(url && anonKey);

/** Tanılama ekranında gösterilir; anahtar asla açığa çıkmaz. */
export const supabaseHost = url ? new URL(url).host : null;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!hasSupabaseConfig) {
    throw new Error("Supabase yapılandırılmamış (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  }
  client ??= createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
