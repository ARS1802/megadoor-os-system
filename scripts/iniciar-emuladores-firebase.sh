#!/usr/bin/env bash
set -euo pipefail

RAIZ_DO_FRONT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ_DO_FRONT"
npx --yes firebase-tools@15.26.0 emulators:start --only auth,firestore
