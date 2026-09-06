import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/** Project Pages URL is https://<user>.github.io/WordEcho/ */
const base = process.env.GITHUB_PAGES === "true" ? "/WordEcho/" : "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        name: "WordEcho",
        short_name: "WordEcho",
        description: "小学生本地记单词",
        theme_color: "#58cc02",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        start_url: "./",
        scope: "./",
        icons: [{ src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "index.html",
      },
    }),
  ],
  test: {
    environment: "node",
  },
});
