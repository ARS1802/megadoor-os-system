#!/usr/bin/env bash
set -euo pipefail

RAIZ_DO_FRONT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ_DO_FRONT"

# A pasta dist pode existir e ainda conter uma versão anterior da aplicação.
# Recompilar antes da visualização garante que as rotas e os componentes
# servidos correspondam ao código-fonte atual.
npm run build
npm run preview
