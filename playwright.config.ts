import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./testes/e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    port: 4173,
    reuseExistingServer: true,
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
