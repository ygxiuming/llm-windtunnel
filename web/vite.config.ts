import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    fs: {
      // allow importing locales/*.json from the repo root
      allow: [path.resolve(__dirname, "../..")],
    },
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
