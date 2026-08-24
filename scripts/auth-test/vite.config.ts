import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      // Gerçek Supabase istemcisi yerine sahtesi.
      { find: /^\.\/supabaseClient$/, replacement: path.resolve(__dirname, "sahteIstemci.ts") },
      { find: "@", replacement: path.resolve(__dirname, "../../src") },
    ],
  },
});
