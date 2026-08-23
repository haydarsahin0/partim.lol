import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages hem `kullanici.github.io/partim.lol/` alt yolunda hem de
// `partim.lol` özel alan adında çalışabilsin diye göreli taban kullanıyoruz.
// Rotalama HashRouter ile yapıldığı için 404.html hilesine de gerek kalmıyor.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          vendor: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
