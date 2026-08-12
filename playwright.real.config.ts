import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

const CONFIRMACAO_EXIGIDA = "SIM";
const PROJETO_FIREBASE_PERMITIDO = "megadoor-os-system";
const SERVIDOR_FASTAPI_PERMITIDO = "192.168.18.206";
const PORTA_FASTAPI_PADRAO = "8443";

if (process.env.MEGADOOR_TESTE_REAL_MUTANTE !== CONFIRMACAO_EXIGIDA) {
  throw new Error(
    `O E2E real altera dados. Defina MEGADOOR_TESTE_REAL_MUTANTE=${CONFIRMACAO_EXIGIDA} para autorizá-lo.`,
  );
}

const enderecoFastApiInformado = process.env.MEGADOOR_FASTAPI_TEST_URL;
if (!enderecoFastApiInformado) {
  throw new Error("Informe MEGADOOR_FASTAPI_TEST_URL=https://192.168.18.206:8443 para o E2E real.");
}

const enderecoFastApi = new URL(enderecoFastApiInformado);
if (
  enderecoFastApi.protocol !== "https:" ||
  enderecoFastApi.hostname !== SERVIDOR_FASTAPI_PERMITIDO ||
  (enderecoFastApi.port || PORTA_FASTAPI_PADRAO) !== PORTA_FASTAPI_PADRAO ||
  !["", "/"].includes(enderecoFastApi.pathname) ||
  enderecoFastApi.search ||
  enderecoFastApi.hash
) {
  throw new Error(
    "MEGADOOR_FASTAPI_TEST_URL deve apontar exatamente para https://192.168.18.206:8443.",
  );
}

if (!process.env.MEGADOOR_FIREBASE_ADMIN_TOKEN) {
  throw new Error(
    "MEGADOOR_FIREBASE_ADMIN_TOKEN é obrigatório para a limpeza segura dos documentos de teste.",
  );
}

const ambienteCarregado = {
  ...loadEnv("production", process.cwd(), ""),
  ...process.env,
};
const variaveisFirebase = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

for (const chave of variaveisFirebase) {
  const valor = ambienteCarregado[chave]?.trim();
  if (!valor) throw new Error(`A variável ${chave} é obrigatória para o E2E real.`);
  // Os testes Node precisam da mesma configuração que o processo Vite. Somente
  // chaves públicas VITE_* são propagadas; o token administrativo não vai ao bundle.
  process.env[chave] = valor;
}

if (process.env.VITE_FIREBASE_PROJECT_ID !== PROJETO_FIREBASE_PERMITIDO) {
  throw new Error(`O E2E real aceita somente o projeto ${PROJETO_FIREBASE_PERMITIDO}.`);
}

const ambienteDoVite = Object.fromEntries(
  variaveisFirebase.map((chave) => [chave, process.env[chave]!]),
);

export default defineConfig({
  testDir: "./testes/e2e-real",
  outputDir: "./test-results/e2e-real",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4174 --strictPort",
    env: {
      ...ambienteDoVite,
      VITE_MODO_APLICACAO: "REAL",
      VITE_USAR_EMULADORES: "false",
    },
    port: 4174,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium-real-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
  ],
});
