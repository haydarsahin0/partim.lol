import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Ortam değişkenleri tanımlıysa gerçek arka uç kullanılabilir demektir. */
export const hasSupabaseConfig = Boolean(url && anonKey);

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
