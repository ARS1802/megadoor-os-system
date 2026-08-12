#!/usr/bin/env bash
set -euo pipefail

RAIZ_DO_FRONT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ_DO_FRONT"

PROJETO_FIREBASE="megadoor-os-system"

printf 'Publicando Rules e indices exclusivamente no projeto %s.\n' "$PROJETO_FIREBASE"
npx --yes firebase-tools@15.26.0 deploy \
  --project "$PROJETO_FIREBASE" \
  --only firestore:rules,firestore:indexes \
  --force \
  --non-interactive
