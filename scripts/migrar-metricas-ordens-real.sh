#!/usr/bin/env bash
set -euo pipefail

RAIZ_DO_FRONT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ_DO_FRONT"

PROJETO_FIREBASE="megadoor-os-system"
CONFIG_FIREBASE_CLI="${XDG_CONFIG_HOME:-${HOME}/.config}/configstore/firebase-tools.json"

npx --yes firebase-tools@15.26.0 projects:list --json >/dev/null

TOKEN_FIREBASE_MIGRACAO="$(
  CONFIG_FIREBASE_CLI="$CONFIG_FIREBASE_CLI" node -e '
    const fs = require("node:fs");
    const config = JSON.parse(fs.readFileSync(process.env.CONFIG_FIREBASE_CLI, "utf8"));
    if (!config.tokens?.access_token) process.exit(2);
    process.stdout.write(config.tokens.access_token);
  '
)"

FIREBASE_ACCESS_TOKEN="$TOKEN_FIREBASE_MIGRACAO" \
  npx --yes tsx@4.20.6 scripts/migrar-metricas-ordens-real.ts \
  "--project=${PROJETO_FIREBASE}" "$@"
