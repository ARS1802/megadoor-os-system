#!/usr/bin/env bash
set -euo pipefail

RAIZ_DO_FRONT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ_DO_FRONT"

PROJETO_FIREBASE="megadoor-os-system"
CONFIRMACAO_EXIGIDA="SIM"
URL_FASTAPI_EXIGIDA="https://192.168.18.206:8443"
CONFIG_FIREBASE_CLI="${XDG_CONFIG_HOME:-${HOME}/.config}/configstore/firebase-tools.json"

if [[ "${MEGADOOR_TESTE_REAL_MUTANTE:-}" != "$CONFIRMACAO_EXIGIDA" ]]; then
  echo "Teste cancelado: defina MEGADOOR_TESTE_REAL_MUTANTE=${CONFIRMACAO_EXIGIDA}." >&2
  exit 2
fi

if [[ "${MEGADOOR_FASTAPI_TEST_URL:-}" != "$URL_FASTAPI_EXIGIDA" ]]; then
  echo "Teste cancelado: defina MEGADOOR_FASTAPI_TEST_URL=${URL_FASTAPI_EXIGIDA}." >&2
  exit 2
fi

# Atualiza o token do Firebase CLI sem imprimir credenciais. Ele é usado apenas
# pelo processo Node do Playwright para remover os documentos criados pelo teste.
npx --yes firebase-tools@15.26.0 projects:list --project "$PROJETO_FIREBASE" --json >/dev/null

TOKEN_FIREBASE_LIMPEZA="$(
  CONFIG_FIREBASE_CLI="$CONFIG_FIREBASE_CLI" node -e '
    const fs = require("node:fs");
    const config = JSON.parse(fs.readFileSync(process.env.CONFIG_FIREBASE_CLI, "utf8"));
    if (!config.tokens?.access_token) process.exit(2);
    process.stdout.write(config.tokens.access_token);
  '
)"

MEGADOOR_FIREBASE_ADMIN_TOKEN="$TOKEN_FIREBASE_LIMPEZA" \
  npx playwright test --config playwright.real.config.ts "$@"
