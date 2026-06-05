import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// "tablet" build is the slim SDK — Agent-network + Surveillance only. The
// heavy Rotterdam-micro view and the experimental cellular view are lazy
// imports gated on `import.meta.env.VITE_TABLET === "1"` in App.tsx, so
// Vite/Rollup tree-shakes both the components and their bulky JSON data
// (rotterdamBuurten.json ~387 KB and netherlandsCaDensity.json ~758 KB) out
// of this build entirely.
export default defineConfig(({ mode }) => {
  const tablet = mode === "tablet";
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["apple-touch-icon.png", "favicon-32.png"],
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,json,woff2}"],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        },
        manifest: {
          name: tablet
            ? "NL Pandemic Sim — Tablet SDK"
            : "Synthetic Netherlands Pandemic Simulator",
          short_name: "NL Pandemic Sim",
          description:
            "A privacy-safe digital twin of the Netherlands: simulate how an outbreak spreads and what surveillance would actually see.",
          theme_color: "#1c5a4c",
          background_color: "#edf4f2",
          display: "standalone",
          orientation: "any",
          start_url: "/",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ],
    build: {
      outDir: tablet ? "dist-tablet" : "dist",
      // The tablet build doesn't need the surveillance/Rotterdam screenshots etc.
      chunkSizeWarningLimit: tablet ? 800 : 1500,
    },
  };
});
