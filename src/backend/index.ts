import { DemoBackend } from "./demoBackend";
import { SupabaseBackend } from "./supabaseBackend";
import type { Backend } from "./types";

let instance: Backend | null = null;

/**
 * Supabase ortam değişkenleri tanımlıysa gerçek arka uç, değilse demo arka uç.
 * Böylece depo klonlanır klonlanmaz (ve GitHub Pages'te) oyun oynanabilir kalır.
 *
 * Koşul doğrudan `import.meta.env` üzerinden yazıldı: anahtarlar tanımsızken
 * derleyici bu dalı ölü kod sayıp Supabase istemcisini pakete hiç koymuyor.
 */
export function getBackend(): Backend {
  if (instance) return instance;
  instance =
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
      ? new SupabaseBackend()
      : new DemoBackend();
  return instance;
}

export type { Backend };
export * from "./types";
