import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./testes/e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    env: {
      VITE_MODO_APLICACAO: "DEMO",
      VITE_USAR_CONFIGURACAO_RUNTIME: "false",
    },
    port: 4173,
    // Nunca reutilize um preview possivelmente iniciado em modo REAL.
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
    {
      name: "firefox-1366",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1366, height: 768 } },
    },
  ],
});
