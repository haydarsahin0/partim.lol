/**
 * Uçtan uca giriş testi için geliştirme sunucusu.
 *
 * Gerçek uygulama, sahte Supabase istemcisiyle. Google'ın onay ekranı dışında
 * her şey gerçek: yönlendirme, sağlayıcı, arka uç sınıfı, arayüz.
 *
 *   npm run dev:auth-e2e
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^\.\/supabaseClient$/,
        replacement: path.resolve(__dirname, "tarayiciIstemci.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "../../src") },
    ],
  },
  define: {
    // Arka uç seçimi bu iki değere bakıyor; Supabase yolunu seçtiriyoruz.
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://sahte.test"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("sahte-anon"),
  },
  server: { port: 4300 },
});
