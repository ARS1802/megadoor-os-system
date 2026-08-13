#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
PACKAGING_ROOT="$PROJECT_ROOT/packaging"
CONFIG_FILE="$PACKAGING_ROOT/distribution.config.json"
PAYLOAD_DIR="$SCRIPT_DIR/payload"
OUTPUT_DIR="$SCRIPT_DIR/output"
NODE_CACHE_DIR="$PACKAGING_ROOT/.cache/node"

fail() {
  printf 'Erro: %s\n' "$1" >&2
  exit 1
}

read_config() {
  local expression="$1"
  node -e \
    'const fs=require("node:fs");const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const value=Function("c",`return (${process.argv[2]})`)(c);if(value===undefined||value===null||value==="")process.exit(2);process.stdout.write(String(value));' \
    "$CONFIG_FILE" "$expression"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Ferramenta obrigatória ausente: $1"
}

safe_reset_directory() {
  local target="$1"
  case "$target" in
    "$SCRIPT_DIR/payload"|"$SCRIPT_DIR/output") ;;
    *) fail "Recusa de limpeza fora das raízes do empacotamento: $target" ;;
  esac
  rm -rf -- "$target"
  mkdir -p -- "$target"
}

require_command node
require_command npm
require_command git
require_command curl
require_command sha256sum
require_command unzip
require_command rg

NODE_BUILD_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "$NODE_BUILD_MAJOR" -ge 20 ]] || fail "O build exige Node.js 20 ou mais recente."

LOCKFILE_VERSION="$(node -p 'require("./package-lock.json").lockfileVersion' 2>/dev/null)" || \
  fail "package-lock.json ausente ou inválido."
[[ "$LOCKFILE_VERSION" == "3" ]] || fail "A release exige package-lock.json lockfileVersion 3."

[[ -f "$CONFIG_FILE" ]] || fail "Configuração de distribuição ausente: $CONFIG_FILE"

APPLICATION_VERSION="$(read_config 'c.application.version')"
RELEASE_TAG="$(read_config 'c.repository.releaseTag')"
NODE_VERSION="$(read_config 'c.runtime.nodeVersion')"
NODE_SHA256="$(read_config 'c.runtime.nodeWindowsX64Sha256')"
FIREBASE_PROJECT_ID="$(read_config 'c.firebase.projectId')"
INNO_VERSION="$(read_config 'c.windows.innoSetupVersion')"
RELEASE_COMMIT="${MEGADOOR_RELEASE_COMMIT:-$(git -C "$PROJECT_ROOT" rev-parse HEAD)}"

[[ "$RELEASE_TAG" == "v$APPLICATION_VERSION" ]] || \
  fail "A tag $RELEASE_TAG não corresponde à versão $APPLICATION_VERSION."
[[ "$RELEASE_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || \
  fail "MEGADOOR_RELEASE_COMMIT deve ser um SHA Git completo."

if [[ "${MEGADOOR_ALLOW_DIRTY_RELEASE:-0}" != "1" ]]; then
  [[ -z "$(git -C "$PROJECT_ROOT" status --porcelain --untracked-files=all)" ]] || \
    fail "O worktree precisa estar limpo para gerar uma release oficial."

  TAG_COMMIT="$(git -C "$PROJECT_ROOT" rev-parse "${RELEASE_TAG}^{commit}" 2>/dev/null)" || \
    fail "A tag $RELEASE_TAG ainda não existe."
  [[ "$TAG_COMMIT" == "$RELEASE_COMMIT" ]] || \
    fail "A tag $RELEASE_TAG não aponta para o commit da release."

  [[ "$(git -C "$PROJECT_ROOT" rev-parse HEAD)" == "$RELEASE_COMMIT" ]] || \
    fail "O commit informado não corresponde ao checkout que será compilado."

  [[ "${MEGADOOR_INNO_LICENSE_CONFIRMED:-}" == "SIM" ]] || \
    fail "Confirme a licença comercial do Inno Setup com MEGADOOR_INNO_LICENSE_CONFIRMED=SIM."

  [[ -n "${MEGADOOR_INNO_INSTALLER_PATH:-}" ]] || \
    fail "A release oficial exige MEGADOOR_INNO_INSTALLER_PATH para verificar o compilador fixado."
fi

printf '1/9 — Validando e compilando o Vue em modo REAL...\n'
(
  cd -- "$PROJECT_ROOT"
  export VITE_MODO_APLICACAO=REAL
  export VITE_USAR_EMULADORES=false
  export VITE_USAR_CONFIGURACAO_RUNTIME=true
  npm run build
)

[[ -f "$PROJECT_ROOT/dist/index.html" ]] || fail "O Vite não produziu dist/index.html."
rg -Fq "$FIREBASE_PROJECT_ID" "$PROJECT_ROOT/dist" || \
  fail "O build não contém o projeto Firebase esperado."
{ [[ "${VITE_MODO_APLICACAO:-REAL}" == "REAL" ]] &&
  [[ "${VITE_USAR_EMULADORES:-false}" == "false" ]] &&
  [[ "${VITE_USAR_CONFIGURACAO_RUNTIME:-true}" == "true" ]]; } || \
  fail "O ambiente da release deve usar Firebase REAL sem emuladores."

printf '2/9 — Gerando o ícone Windows...\n'
[[ -f "$PACKAGING_ROOT/assets/megadoor-icon.svg" ]] || fail "SVG canônico do ícone ausente."
[[ -f "$PACKAGING_ROOT/assets/megadoor-icon.ico" ]] || fail "ICO versionado do ícone ausente."
mapfile -t ICON_COLORS < <(
  grep -Eo '#[0-9A-Fa-f]{6}' "$PACKAGING_ROOT/assets/megadoor-icon.svg" |
    tr '[:lower:]' '[:upper:]' | sort -u
)
[[ "${#ICON_COLORS[@]}" -le 2 ]] || fail "O SVG do ícone excede o limite de duas cores."

printf '3/9 — Recriando o payload mínimo...\n'
safe_reset_directory "$PAYLOAD_DIR"
mkdir -p -- \
  "$PAYLOAD_DIR/app" \
  "$PAYLOAD_DIR/assets" \
  "$PAYLOAD_DIR/bin" \
  "$PAYLOAD_DIR/runtime" \
  "$PAYLOAD_DIR/server"

cp -a -- "$PROJECT_ROOT/dist/." "$PAYLOAD_DIR/app/"
cp -- "$PACKAGING_ROOT/assets/megadoor-icon.ico" "$PAYLOAD_DIR/assets/megadoor-icon.ico"
cp -- "$PACKAGING_ROOT/assets/megadoor-icon.svg" "$PAYLOAD_DIR/assets/megadoor-icon.svg"
cp -- "$SCRIPT_DIR/runtime/static-server.mjs" "$PAYLOAD_DIR/server/static-server.mjs"
node "$PACKAGING_ROOT/scripts/gerar-avisos-de-terceiros.mjs" \
  "$PAYLOAD_DIR/THIRD-PARTY-NOTICES.txt"

printf '4/9 — Compilando o launcher sem console...\n'
"$SCRIPT_DIR/launcher/compilar-launcher.sh" "$PAYLOAD_DIR/bin"
strings -el "$PAYLOAD_DIR/bin/Megadoor.exe" | grep -F -- '--shutdown' >/dev/null || \
  fail "O launcher compilado não oferece o contrato obrigatório --shutdown."

printf '5/9 — Preparando Node.js %s privado...\n' "$NODE_VERSION"
mkdir -p -- "$NODE_CACHE_DIR"
NODE_ARCHIVE_NAME="node-v${NODE_VERSION}-win-x64.zip"
NODE_ARCHIVE="$NODE_CACHE_DIR/$NODE_ARCHIVE_NAME"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE_NAME}"

if [[ -f "$NODE_ARCHIVE" ]] && \
   [[ "$(sha256sum "$NODE_ARCHIVE" | awk '{print $1}')" != "$NODE_SHA256" ]]; then
  rm -f -- "$NODE_ARCHIVE"
fi

if [[ ! -f "$NODE_ARCHIVE" ]]; then
  curl --fail --location --proto '=https' --tlsv1.2 \
    --retry 3 --retry-delay 2 \
    --output "$NODE_ARCHIVE.partial" "$NODE_URL"
  if ! printf '%s  %s\n' "$NODE_SHA256" "$NODE_ARCHIVE.partial" | \
       sha256sum --check --status; then
    rm -f -- "$NODE_ARCHIVE.partial"
    fail "O SHA-256 do Node.js baixado é inválido."
  fi
  mv -- "$NODE_ARCHIVE.partial" "$NODE_ARCHIVE"
fi

printf '%s  %s\n' "$NODE_SHA256" "$NODE_ARCHIVE" | sha256sum --check --status || \
  fail "O arquivo em cache do Node.js é inválido."

NODE_EXTRACT_DIR="$(mktemp -d /tmp/megadoor-node-windows.XXXXXX)"
trap 'rm -rf -- "$NODE_EXTRACT_DIR"' EXIT
unzip -q "$NODE_ARCHIVE" -d "$NODE_EXTRACT_DIR"
NODE_SOURCE_DIR="$NODE_EXTRACT_DIR/node-v${NODE_VERSION}-win-x64"
[[ -f "$NODE_SOURCE_DIR/node.exe" ]] || fail "node.exe não foi encontrado no arquivo oficial."
[[ -f "$NODE_SOURCE_DIR/LICENSE" ]] || fail "A licença do Node.js não foi encontrada."
cp -- "$NODE_SOURCE_DIR/node.exe" "$PAYLOAD_DIR/runtime/node.exe"
cp -- "$NODE_SOURCE_DIR/LICENSE" "$PAYLOAD_DIR/runtime/NODE-LICENSE.txt"

printf '6/9 — Gerando manifesto e checksums do payload...\n'
MEGADOOR_RELEASE_COMMIT="$RELEASE_COMMIT" \
  node "$PACKAGING_ROOT/scripts/gerar-manifesto.mjs" "$PAYLOAD_DIR" windows-x64

printf '7/9 — Gerando e validando as constantes do Inno Setup...\n'
MEGADOOR_RELEASE_COMMIT="$RELEASE_COMMIT" \
MEGADOOR_ALLOW_DIRTY_RELEASE="${MEGADOOR_ALLOW_DIRTY_RELEASE:-0}" \
  node "$SCRIPT_DIR/generate-inno-constants.mjs"
MEGADOOR_RELEASE_COMMIT="$RELEASE_COMMIT" \
MEGADOOR_ALLOW_DIRTY_RELEASE="${MEGADOOR_ALLOW_DIRTY_RELEASE:-0}" \
  node "$SCRIPT_DIR/validate-installer.mjs"

printf '8/9 — Compilando com Inno Setup %s...\n' "$INNO_VERSION"
ISCC_PATH="${MEGADOOR_ISCC:-}"
if [[ -z "$ISCC_PATH" ]]; then
  if command -v ISCC.exe >/dev/null 2>&1; then
    ISCC_PATH="$(command -v ISCC.exe)"
  elif command -v iscc >/dev/null 2>&1; then
    ISCC_PATH="$(command -v iscc)"
  else
    fail "Defina MEGADOOR_ISCC com o caminho do ISCC.exe do Inno Setup $INNO_VERSION."
  fi
fi

[[ -f "$ISCC_PATH" || -x "$ISCC_PATH" ]] || fail "Compilador Inno Setup não encontrado: $ISCC_PATH"

if [[ -n "${MEGADOOR_INNO_INSTALLER_PATH:-}" ]]; then
  EXPECTED_INNO_SHA256="$(read_config 'c.windows.innoSetupWindowsX64Sha256')"
  [[ -f "$MEGADOOR_INNO_INSTALLER_PATH" ]] || \
    fail "Instalador do Inno Setup não encontrado: $MEGADOOR_INNO_INSTALLER_PATH"
  printf '%s  %s\n' "$EXPECTED_INNO_SHA256" "$MEGADOOR_INNO_INSTALLER_PATH" | \
    sha256sum --check --status || \
    fail "O SHA-256 do instalador do Inno Setup não corresponde à versão fixada."
fi
safe_reset_directory "$OUTPUT_DIR"

if [[ "$ISCC_PATH" == *.exe ]]; then
  require_command wine
  require_command winepath
  ISCC_DETECTED_VERSION="$(WINEDEBUG=-all wine "$ISCC_PATH" --version 2>/dev/null | tr -d '\r\n')"
  [[ "$ISCC_DETECTED_VERSION" == "$INNO_VERSION" ]] || \
    fail "Inno Setup incompatível: esperado $INNO_VERSION, encontrado ${ISCC_DETECTED_VERSION:-desconhecido}."
  INSTALLER_SCRIPT_WINDOWS="$(winepath -w "$SCRIPT_DIR/Megadoor.iss")"
  WINEDEBUG=-all wine "$ISCC_PATH" "$INSTALLER_SCRIPT_WINDOWS"
else
  ISCC_DETECTED_VERSION="$("$ISCC_PATH" --version 2>/dev/null | tr -d '\r\n')"
  [[ "$ISCC_DETECTED_VERSION" == "$INNO_VERSION" ]] || \
    fail "Inno Setup incompatível: esperado $INNO_VERSION, encontrado ${ISCC_DETECTED_VERSION:-desconhecido}."
  "$ISCC_PATH" "$SCRIPT_DIR/Megadoor.iss"
fi

SETUP_FILE="$OUTPUT_DIR/Megadoor-Setup-${APPLICATION_VERSION}-windows-x64.exe"
[[ -f "$SETUP_FILE" ]] || fail "O Inno Setup não produziu o arquivo esperado."

printf '9/9 — Gerando checksum final...\n'
(
  cd -- "$OUTPUT_DIR"
  sha256sum "$(basename -- "$SETUP_FILE")" > "$(basename -- "$SETUP_FILE").sha256"
)

printf '\nInstalador criado sem publicar arquivos:\n%s\n' "$SETUP_FILE"
printf 'SHA-256: '
sha256sum "$SETUP_FILE" | awk '{print $1}'
