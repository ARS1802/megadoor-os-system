import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./testes/configuracao.ts"],
    exclude: [
      "testes/e2e/**",
      "testes/e2e-real/**",
      "testes/firestore/**",
      "packaging/**",
      "node_modules/**",
      "dist/**",
    ],
  },
});
