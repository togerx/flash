import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/* Date et heure du build (« 2026.11.22-1842 ») : permet de vérifier quelle
   version tourne sur un téléphone (affichée dans « Mon compte »). */
function buildStamp(now) {
  const two = (v) => String(v).padStart(2, "0");
  return `${now.getFullYear()}.${two(now.getMonth() + 1)}.${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;
}

export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(buildStamp(new Date())) },
  plugins: [
    react(),
    VitePWA({
      // Mise à jour PROPOSÉE (bandeau UpdatePrompt), jamais appliquée d'office :
      // un rechargement forcé couperait une révision en cours. Les appareils
      // encore sur l'ancienne version (« autoUpdate ») passent à celle-ci
      // automatiquement une dernière fois.
      registerType: "prompt",
      includeAssets: ["favicon.png", "apple-touch-icon.png", "logo.png"],
      manifest: {
        name: "Flash",
        short_name: "Flash",
        description: "Réviser à plusieurs à partir de paquets de cartes recto/verso.",
        lang: "fr",
        start_url: "/",
        display: "standalone",
        background_color: "#f1f5f9",
        theme_color: "#7c3aed",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Le moteur SQLite ne sert qu'à l'import Anki : l'imposer au premier
        // chargement ferait payer 658 Ko à tout le monde. Il est mis en cache
        // à sa première utilisation (voir runtimeCaching).
        globPatterns: ["**/*.{js,css,html,png,woff2}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: "CacheFirst",
            options: {
              cacheName: "wasm",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 180 },
            },
          },
          {
            // Images des cartes : consultables hors ligne une fois vues.
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cartes",
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
