#!/usr/bin/env bash

set -Eeuo pipefail

readonly APPLICATION_NAME="Megadoor"
readonly NODE_VERSION="24.19.0"
readonly NODE_ARCHIVE_NAME="node-v${NODE_VERSION}-linux-x64.tar.xz"
readonly NODE_DOWNLOAD_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE_NAME}"
readonly NODE_ARCHIVE_SHA256="14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647"
readonly LOCAL_APPLICATION_PORT="41731"
readonly SOURCE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}"
readonly INSTALL_ROOT="${DATA_HOME}/megadoor"
readonly APPLICATIONS_ROOT="${DATA_HOME}/applications"
readonly LOG_ROOT="${XDG_STATE_HOME:-${HOME}/.local/state}/megadoor"
readonly STAGING_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/megadoor-install.XXXXXXXX")"
readonly PAYLOAD_ROOT="${STAGING_ROOT}/payload"
readonly BACKUP_ROOT="${INSTALL_ROOT}.backup.$RANDOM$RANDOM"

SERVER_ADDRESS="${MEGADOOR_SERVER_ADDRESS:-}"
SERVER_PORT="${MEGADOOR_SERVER_PORT:-8443}"
NON_INTERACTIVE="${MEGADOOR_NON_INTERACTIVE:-0}"
INSTALL_COMMITTED=0
LOG_FILE=""

step() {
  printf '\n\033[1;36m==> %s\033[0m\n' "$1"
}

fail() {
  printf '\n\033[1;31mA instalação falhou: %s\033[0m\n' "$1" >&2
  exit 1
}

cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 && -d "$BACKUP_ROOT" && ! -e "$INSTALL_ROOT" ]]; then
    mv -- "$BACKUP_ROOT" "$INSTALL_ROOT" || true
    printf '\033[1;33mA instalação anterior foi restaurada.\033[0m\n' >&2
  fi
  if [[ -d "$STAGING_ROOT" ]]; then
    rm -rf -- "$STAGING_ROOT"
  fi
  return "$exit_code"
}
trap cleanup EXIT

is_ipv4() {
  local value=$1 part
  local -a parts
  [[ $value =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  IFS='.' read -r -a parts <<<"$value"
  for part in "${parts[@]}"; do
    [[ ${#part} -eq 1 || ${part:0:1} != 0 ]] || return 1
    ((10#$part >= 0 && 10#$part <= 255)) || return 1
  done
}

install_system_dependencies() {
  local -a packages=()
  command -v curl >/dev/null 2>&1 || packages+=(curl)
  command -v tar >/dev/null 2>&1 || packages+=(tar)
  command -v xz >/dev/null 2>&1 || packages+=(xz-utils)
  command -v sha256sum >/dev/null 2>&1 || packages+=(coreutils)
  command -v xdg-open >/dev/null 2>&1 || packages+=(xdg-utils)
  command -v xdg-user-dir >/dev/null 2>&1 || packages+=(xdg-user-dirs)
  [[ -r /etc/ssl/certs/ca-certificates.crt ]] || packages+=(ca-certificates)

  ((${#packages[@]} == 0)) && return
  command -v apt-get >/dev/null 2>&1 ||
    fail "Dependências ausentes (${packages[*]}) e esta distribuição não possui apt-get."

  step "Instalando dependências do sistema: ${packages[*]}"
  local -a privilege=()
  if ((EUID != 0)); then
    command -v sudo >/dev/null 2>&1 ||
      fail "É necessário sudo para instalar: ${packages[*]}."
    privilege=(sudo)
  fi
  "${privilege[@]}" apt-get update
  "${privilege[@]}" apt-get install -y --no-install-recommends "${packages[@]}"
}

stop_previous_server() {
  local state_path="${INSTALL_ROOT}/server-state.json"
  local expected_node="${INSTALL_ROOT}/runtime/bin/node"
  [[ -f "$state_path" ]] || return 0

  local pid
  pid=$(sed -nE 's/.*"pid"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' "$state_path" | head -n 1)
  [[ $pid =~ ^[0-9]+$ ]] || return 0
  [[ -e "/proc/${pid}/exe" ]] || return 0

  local executable
  executable=$(readlink -f -- "/proc/${pid}/exe" 2>/dev/null || true)
  if [[ "$executable" == "$(readlink -f -- "$expected_node" 2>/dev/null || true)" ]]; then
    step "Encerrando a instância anterior do Megadoor"
    kill -TERM "$pid" 2>/dev/null || true
    for _ in {1..40}; do
      kill -0 "$pid" 2>/dev/null || return 0
      sleep 0.25
    done
    kill -KILL "$pid" 2>/dev/null || true
  fi
  return 0
}

create_linux_launcher() {
  cat >"${PAYLOAD_ROOT}/start-megadoor.sh" <<'LAUNCHER'
#!/usr/bin/env bash
set -Eeuo pipefail

readonly INSTALL_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly NODE="${INSTALL_ROOT}/runtime/bin/node"
readonly SERVER="${INSTALL_ROOT}/servidor-aplicacao-instalada.mjs"
readonly URL="http://127.0.0.1:41731/"
readonly HEALTH_URL="http://127.0.0.1:41731/.megadoor/health"
readonly LOG_ROOT="${XDG_STATE_HOME:-${HOME}/.local/state}/megadoor"

mkdir -p -- "$LOG_ROOT"

if [[ ! -x "$NODE" ]]; then
  printf 'A instalação do Megadoor está incompleta. Execute LinuxInstaller.sh novamente.\n' >&2
  exit 1
fi

if ! curl --silent --fail --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
  timestamp=$(date +%Y%m%d-%H%M%S)
  nohup "$NODE" "$SERVER" "$INSTALL_ROOT" \
    >"${LOG_ROOT}/aplicacao-${timestamp}.log" \
    2>"${LOG_ROOT}/aplicacao-${timestamp}.err.log" </dev/null &

  ready=0
  for _ in {1..40}; do
    sleep 0.25
    if curl --silent --fail --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
      ready=1
      break
    fi
  done
  if ((ready == 0)); then
    printf 'O servidor local do Megadoor não iniciou. Consulte %s.\n' "$LOG_ROOT" >&2
    exit 2
  fi
fi

xdg-open "$URL" >/dev/null 2>&1 &
LAUNCHER
  chmod 0755 "${PAYLOAD_ROOT}/start-megadoor.sh"
}

create_desktop_shortcuts() {
  local desktop_path
  desktop_path=$(xdg-user-dir DESKTOP 2>/dev/null || true)
  [[ -n "$desktop_path" ]] || desktop_path="${HOME}/Desktop"
  mkdir -p -- "$desktop_path" "$APPLICATIONS_ROOT"

  local desktop_file="${APPLICATIONS_ROOT}/megadoor.desktop"
  cat >"$desktop_file" <<DESKTOP
[Desktop Entry]
Type=Application
Version=1.0
Name=Megadoor
Comment=Abrir o Megadoor
Exec="${INSTALL_ROOT}/start-megadoor.sh"
Icon=${INSTALL_ROOT}/assets/megadoor-icon.svg
Terminal=false
Categories=Office;
StartupNotify=true
DESKTOP
  chmod 0755 "$desktop_file"
  cp -- "$desktop_file" "${desktop_path}/Megadoor.desktop"
  chmod 0755 "${desktop_path}/Megadoor.desktop"
  if command -v gio >/dev/null 2>&1; then
    gio set "${desktop_path}/Megadoor.desktop" metadata::trusted true >/dev/null 2>&1 || true
  fi
  printf '%s' "${desktop_path}/Megadoor.desktop"
}

[[ $(uname -s) == Linux ]] || fail "Este instalador deve ser executado no Linux."
[[ $(uname -m) == x86_64 ]] || fail "O Megadoor requer Linux x86_64."

required_files=(
  package.json
  package-lock.json
  .env.production
  scripts/servidor-aplicacao-instalada.mjs
  assets/icons/megadoor-icon.svg
)
for relative_path in "${required_files[@]}"; do
  [[ -f "${SOURCE_ROOT}/${relative_path}" ]] ||
    fail "Arquivo obrigatório ausente: ${relative_path}. Extraia o pacote completo do projeto antes de instalar."
done

if [[ -z "$SERVER_ADDRESS" ]]; then
  ((NON_INTERACTIVE == 0)) || fail "Defina MEGADOOR_SERVER_ADDRESS no modo não interativo."
  while true; do
    read -r -p "IPv4 da máquina que executa a FastAPI: " SERVER_ADDRESS
    is_ipv4 "$SERVER_ADDRESS" && break
    printf 'Informe um IPv4 válido, por exemplo 192.168.1.20.\n' >&2
  done
else
  is_ipv4 "$SERVER_ADDRESS" || fail "MEGADOOR_SERVER_ADDRESS deve ser um IPv4 válido."
fi
[[ $SERVER_PORT =~ ^[0-9]+$ ]] && ((SERVER_PORT >= 1 && SERVER_PORT <= 65535)) ||
  fail "MEGADOOR_SERVER_PORT deve estar entre 1 e 65535."

mkdir -p -- "$LOG_ROOT"
LOG_FILE="${LOG_ROOT}/instalacao-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

install_system_dependencies

step "Preparando diretório temporário"
mkdir -p -- "$PAYLOAD_ROOT"

step "Baixando o Node.js privado ${NODE_VERSION}"
node_archive="${STAGING_ROOT}/${NODE_ARCHIVE_NAME}"
curl --fail --location --retry 2 --connect-timeout 15 \
  --output "$node_archive" "$NODE_DOWNLOAD_URL"
printf '%s  %s\n' "$NODE_ARCHIVE_SHA256" "$node_archive" | sha256sum --check --status ||
  fail "O download do Node.js falhou na verificação SHA-256."

node_extract_root="${STAGING_ROOT}/node-extraido"
mkdir -p -- "$node_extract_root"
tar -xJf "$node_archive" -C "$node_extract_root"
node_root="${node_extract_root}/node-v${NODE_VERSION}-linux-x64"
[[ -x "${node_root}/bin/npm" ]] || fail "O runtime Node.js baixado está incompleto."

step "Instalando dependências exatas do frontend"
export PATH="${node_root}/bin:${PATH}"
(
  cd -- "$SOURCE_ROOT"
  npm ci --no-audit --no-fund
  export VITE_MODO_APLICACAO=REAL
  export VITE_USAR_EMULADORES=false
  export VITE_USAR_CONFIGURACAO_RUNTIME=true
  npm run build
)
[[ -f "${SOURCE_ROOT}/dist/index.html" ]] || fail "A compilação não produziu dist/index.html."

step "Montando a instalação definitiva"
cp -a -- "$node_root" "${PAYLOAD_ROOT}/runtime"
mkdir -p -- "${PAYLOAD_ROOT}/app" "${PAYLOAD_ROOT}/assets"
cp -a -- "${SOURCE_ROOT}/dist/." "${PAYLOAD_ROOT}/app/"
cp -- "${SOURCE_ROOT}/assets/icons/megadoor-icon.svg" "${PAYLOAD_ROOT}/assets/megadoor-icon.svg"
cp -- "${SOURCE_ROOT}/scripts/servidor-aplicacao-instalada.mjs" \
  "${PAYLOAD_ROOT}/servidor-aplicacao-instalada.mjs"

installation_id=$("${node_root}/bin/node" -e 'process.stdout.write(require("node:crypto").randomUUID().replaceAll("-", ""))')
cat >"${PAYLOAD_ROOT}/app/runtime-config.json" <<CONFIG
{
  "schemaVersion": 1,
  "installationId": "${installation_id}",
  "server": {
    "address": "${SERVER_ADDRESS}",
    "port": ${SERVER_PORT}
  }
}
CONFIG
create_linux_launcher

stop_previous_server
mkdir -p -- "$(dirname -- "$INSTALL_ROOT")"
if [[ -e "$INSTALL_ROOT" ]]; then
  mv -- "$INSTALL_ROOT" "$BACKUP_ROOT"
fi
mv -- "$PAYLOAD_ROOT" "$INSTALL_ROOT"
shortcut_path=$(create_desktop_shortcuts)
INSTALL_COMMITTED=1
if [[ -d "$BACKUP_ROOT" ]]; then
  rm -rf -- "$BACKUP_ROOT"
fi

printf '\n\033[1;32mMegadoor instalado com sucesso.\033[0m\n'
printf 'Instalação: %s\n' "$INSTALL_ROOT"
printf 'Atalho: %s\n' "$shortcut_path"
printf 'Log: %s\n' "$LOG_FILE"

if ((NON_INTERACTIVE == 0)); then
  read -r -p "Deseja abrir o Megadoor agora? [S/n] " open_now
  if [[ -z $open_now || $open_now =~ ^[sS]$ ]]; then
    "${INSTALL_ROOT}/start-megadoor.sh"
  fi
fi
