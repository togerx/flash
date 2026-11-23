import { defineConfig } from "vitest/config";

// Configuration des tests, séparée de vite.config.js : les tests n'ont besoin ni
// de React ni du plugin PWA. Fichiers testés un par un (pas de parallélisme),
// plus fiable sous Windows.
export default defineConfig({
  test: {
    include: ["src/**/*.test.js"],
    environment: "node",
    fileParallelism: false,
  },
});
