#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT_DIR="${1:-$PROJECT_ROOT/packaging/windows/payload/bin}"
ICON="$PROJECT_ROOT/packaging/assets/megadoor-icon.ico"
CONFIG="$PROJECT_ROOT/packaging/distribution.config.json"

fail() {
  printf 'Erro: %s\n' "$1" >&2
  exit 1
}

command -v mcs >/dev/null 2>&1 || fail "O compilador Mono mcs não está disponível."
command -v node >/dev/null 2>&1 || fail "Node.js não está disponível no ambiente de build."
[[ -f "$ICON" ]] || fail "Gere primeiro o ícone com packaging/assets/gerar-icone-windows.sh."
[[ -f "$CONFIG" ]] || fail "Configuração central não encontrada: $CONFIG"

mkdir -p -- "$OUTPUT_DIR"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf -- "$WORK_DIR"' EXIT

APPLICATION_VERSION="$(node -e '
  const fs = require("node:fs");
  const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(config?.application?.version ?? "")) process.exit(1);
  process.stdout.write(config.application.version);
' "$CONFIG")" || fail "A versão da aplicação é inválida."

printf '%s\n' \
  'using System.Reflection;' \
  "[assembly: AssemblyVersion(\"${APPLICATION_VERSION}.0\")]" \
  "[assembly: AssemblyFileVersion(\"${APPLICATION_VERSION}.0\")]" \
  >"$WORK_DIR/GeneratedVersion.cs"

mcs \
  -nologo \
  -optimize+ \
  -platform:x64 \
  -target:winexe \
  -sdk:4.8 \
  -win32icon:"$ICON" \
  -r:System.dll \
  -r:System.Web.Extensions.dll \
  -r:System.Windows.Forms.dll \
  -out:"$OUTPUT_DIR/Megadoor.exe" \
  "$SCRIPT_DIR/AssemblyInfo.cs" \
  "$WORK_DIR/GeneratedVersion.cs" \
  "$SCRIPT_DIR/MegadoorLauncher.cs"

printf 'Launcher criado: %s\n' "$OUTPUT_DIR/Megadoor.exe"
printf 'SHA-256: '
sha256sum "$OUTPUT_DIR/Megadoor.exe" | awk '{print $1}'
