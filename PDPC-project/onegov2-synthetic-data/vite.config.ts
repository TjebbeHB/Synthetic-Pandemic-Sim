import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Both builds open the PDPC Rotterdam workspace. The tablet mode still limits
// the legacy dashboard options inside App.tsx; it is no longer a slim build.
export default defineConfig(({ mode }) => {
  const tablet = mode === "tablet";
  return {
    define: { "import.meta.env.VITE_TABLET": JSON.stringify(tablet ? "1" : "0") },
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
          name: "PDPC Rotterdam Scenario-atlas",
          short_name: "PDPC Scenario Lab",
          description:
            "Synthetische scenarioverkenning met Rotterdamse buurtprofielen. Onderzoeksprototype, geen gevalideerde voorspelling.",
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
