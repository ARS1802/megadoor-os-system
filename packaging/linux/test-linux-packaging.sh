#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

RAIZ_DO_PROJETO="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)"
TEMP="$(mktemp -d "${TMPDIR:-/tmp}/megadoor-linux-tests.XXXXXXXX")"

limpar() {
  local codigo="$?"
  set +e
  rm -rf -- "$TEMP"
  exit "$codigo"
}
trap limpar EXIT INT TERM

falhar() {
  printf 'Falha: %s\n' "$1" >&2
  exit 1
}

assert_arquivo() {
  [[ -f "$1" ]] || falhar "arquivo não encontrado: $1"
}

assert_nao_existe() {
  [[ ! -e "$1" && ! -L "$1" ]] || falhar "o caminho deveria ter sido removido: $1"
}

PAYLOAD="$TEMP/payload"
mkdir -p -- \
  "$PAYLOAD/app/assets" \
  "$PAYLOAD/assets" \
  "$PAYLOAD/bin" \
  "$PAYLOAD/runtime/bin" \
  "$PAYLOAD/server"

printf '%s\n' '<!doctype html><html><title>Megadoor</title></html>' >"$PAYLOAD/app/index.html"
printf '%s\n' 'console.log("asset")' >"$PAYLOAD/app/assets/index-12345678.js"
NODE_DO_TESTE="$(command -v node)"
VERSAO_CONFIGURADA="$(
  node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).runtime.nodeVersion' \
    "$RAIZ_DO_PROJETO/packaging/distribution.config.json"
)"
printf '#!/usr/bin/env bash\nif [[ "${1:-}" == "--version" ]]; then printf "v%s\\n"; exit 0; fi\nexec %q "$@"\n' \
  "$VERSAO_CONFIGURADA" "$NODE_DO_TESTE" >"$PAYLOAD/runtime/bin/node"
printf '%s\n' "Node.js test license" >"$PAYLOAD/runtime/LICENSE"
cp -- "$RAIZ_DO_PROJETO/packaging/assets/megadoor-icon.svg" "$PAYLOAD/assets/"
cp -- "$RAIZ_DO_PROJETO/packaging/distribution.config.json" "$PAYLOAD/distribution.config.json"
cp -- "$RAIZ_DO_PROJETO/packaging/windows/runtime/static-server.mjs" "$PAYLOAD/server/"
node "$RAIZ_DO_PROJETO/packaging/scripts/gerar-avisos-de-terceiros.mjs" \
  "$PAYLOAD/THIRD-PARTY-NOTICES.txt" >/dev/null
cp -- "$RAIZ_DO_PROJETO/packaging/linux/runtime/installer-support.mjs" "$PAYLOAD/bin/"
cp -- "$RAIZ_DO_PROJETO/packaging/linux/runtime/linux-launcher.mjs" "$PAYLOAD/bin/"
cp -- "$RAIZ_DO_PROJETO/packaging/linux/runtime/megadoor" "$PAYLOAD/bin/"
cp -- "$RAIZ_DO_PROJETO/packaging/linux/runtime/megadoor-uninstall" "$PAYLOAD/bin/"
chmod 700 -- "$PAYLOAD/runtime/bin/node" "$PAYLOAD/bin/megadoor" "$PAYLOAD/bin/megadoor-uninstall"

node "$RAIZ_DO_PROJETO/packaging/scripts/gerar-manifesto.mjs" "$PAYLOAD" linux-x64 >/dev/null
node "$PAYLOAD/bin/installer-support.mjs" validate-payload "$PAYLOAD" linux-x64 >/dev/null

cp -a -- "$PAYLOAD" "$TEMP/payload-corrompido"
printf '%s\n' "corrompido" >>"$TEMP/payload-corrompido/app/index.html"
if node "$TEMP/payload-corrompido/bin/installer-support.mjs" \
  validate-payload "$TEMP/payload-corrompido" linux-x64 >/dev/null 2>&1; then
  falhar "o validador aceitou um payload corrompido"
fi

HOME_TESTE="$TEMP/Usuário com espaço e acento"
export HOME="$HOME_TESTE"
export XDG_DATA_HOME="$TEMP/xdg data"
export XDG_CONFIG_HOME="$TEMP/xdg config"
export XDG_STATE_HOME="$TEMP/xdg state"
export XDG_BIN_HOME="$TEMP/xdg bin"
mkdir -p -- "$HOME" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_BIN_HOME"

bash "$RAIZ_DO_PROJETO/packaging/linux/Instalar-Megadoor.sh" \
  --payload "$PAYLOAD" \
  --server-ip 192.168.18.206 \
  --server-port 8443 \
  --no-desktop-shortcut \
  --non-interactive >/dev/null

RAIZ_INSTALADA="$XDG_DATA_HOME/megadoor"
assert_arquivo "$RAIZ_INSTALADA/install-state.json"
assert_arquivo "$XDG_CONFIG_HOME/megadoor/runtime-config.json"
assert_arquivo "$XDG_DATA_HOME/applications/br.com.megadoor.os.desktop"
assert_arquivo "$XDG_DATA_HOME/icons/hicolor/scalable/apps/br.com.megadoor.os.svg"
[[ -L "$XDG_BIN_HOME/megadoor" ]] || falhar "launcher simbólico não foi criado"
[[ -L "$XDG_BIN_HOME/megadoor-uninstall" ]] || falhar "desinstalador simbólico não foi criado"

node - "$RAIZ_INSTALADA/install-state.json" "$XDG_CONFIG_HOME/megadoor/runtime-config.json" \
  "$RAIZ_DO_PROJETO/packaging/distribution.config.json" <<'NODE'
const fs = require("fs");
const [statePath, configPath, constantsPath] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const constants = JSON.parse(fs.readFileSync(constantsPath, "utf8"));
if (state.installationId !== config.installationId) throw new Error("installationId divergente");
if (state.localApplicationPort !== constants.linux.localApplicationPort) {
  throw new Error("a porta local diverge da configuração central");
}
if (state.configurationSchemaVersion !== constants.configurationSchemaVersion) {
  throw new Error("o schema diverge da configuração central");
}
if (config.server.address !== "192.168.18.206" || config.server.port !== 8443) {
  throw new Error("servidor persistido incorretamente");
}
NODE

"$XDG_BIN_HOME/megadoor" --self-test >/dev/null

ID_ANTERIOR="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).installationId" "$RAIZ_INSTALADA/install-state.json")"
mkdir -p -- "$XDG_STATE_HOME/megadoor"
printf '{"installId":"%s","pid":999999,"port":41731}\n' "$ID_ANTERIOR" \
  >"$XDG_STATE_HOME/megadoor/server-state.json"
"$XDG_BIN_HOME/megadoor-uninstall" --stop-only >/dev/null
assert_nao_existe "$XDG_STATE_HOME/megadoor/server-state.json"

cp -- "$XDG_CONFIG_HOME/megadoor/runtime-config.json" "$TEMP/runtime-config.valido"
printf '%s\n' '{"configuracao":"corrompida"}' >"$XDG_CONFIG_HOME/megadoor/runtime-config.json"
"$XDG_BIN_HOME/megadoor-uninstall" --stop-only >/dev/null
cp -- "$TEMP/runtime-config.valido" "$XDG_CONFIG_HOME/megadoor/runtime-config.json"

bash "$RAIZ_DO_PROJETO/packaging/linux/Instalar-Megadoor.sh" \
  --payload "$PAYLOAD" \
  --server-ip 192.168.18.207 \
  --server-port 9443 \
  --no-desktop-shortcut \
  --non-interactive >/dev/null
ID_REINSTALADO="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).installationId" "$RAIZ_INSTALADA/install-state.json")"
[[ "$ID_REINSTALADO" == "$ID_ANTERIOR" ]] || falhar "a reinstalação trocou installationId"

"$XDG_BIN_HOME/megadoor-uninstall" --keep-data >/dev/null
assert_nao_existe "$RAIZ_INSTALADA"
assert_nao_existe "$XDG_BIN_HOME/megadoor"
assert_nao_existe "$XDG_BIN_HOME/megadoor-uninstall"
assert_arquivo "$XDG_CONFIG_HOME/megadoor/runtime-config.json"

bash "$RAIZ_DO_PROJETO/packaging/linux/Instalar-Megadoor.sh" \
  --payload "$PAYLOAD" \
  --server-ip 192.168.18.208 \
  --server-port 8443 \
  --no-desktop-shortcut \
  --non-interactive >/dev/null
"$XDG_BIN_HOME/megadoor-uninstall" --remove-data >/dev/null
assert_nao_existe "$RAIZ_INSTALADA"
assert_nao_existe "$XDG_CONFIG_HOME/megadoor"
assert_nao_existe "$XDG_STATE_HOME/megadoor"

HOME_FALHA="$TEMP/home-falha-tardia"
export HOME="$HOME_FALHA"
export XDG_DATA_HOME="$TEMP/falha data"
export XDG_CONFIG_HOME="$TEMP/falha config"
export XDG_STATE_HOME="$TEMP/falha state"
export XDG_BIN_HOME="$TEMP/falha bin"
mkdir -p -- "$HOME" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_BIN_HOME"
PAYLOAD_FALHA="$TEMP/payload-falha-tardia"
cp -a -- "$PAYLOAD" "$PAYLOAD_FALHA"
printf '%s\n' 'process.exit(7);' >"$PAYLOAD_FALHA/bin/linux-launcher.mjs"
rm -f -- "$PAYLOAD_FALHA/payload-manifest.json" "$PAYLOAD_FALHA/files.sha256"
node "$RAIZ_DO_PROJETO/packaging/scripts/gerar-manifesto.mjs" "$PAYLOAD_FALHA" linux-x64 >/dev/null

if bash "$RAIZ_DO_PROJETO/packaging/linux/Instalar-Megadoor.sh" \
  --payload "$PAYLOAD_FALHA" \
  --server-ip 192.168.18.206 \
  --server-port 8443 \
  --no-desktop-shortcut \
  --non-interactive >/dev/null 2>&1; then
  falhar "o instalador aceitou falha tardia do self-test"
fi
assert_nao_existe "$XDG_DATA_HOME/megadoor/current"
assert_nao_existe "$XDG_BIN_HOME/megadoor"
assert_nao_existe "$XDG_BIN_HOME/megadoor-uninstall"
assert_nao_existe "$XDG_DATA_HOME/applications/br.com.megadoor.os.desktop"
assert_nao_existe "$XDG_DATA_HOME/applications/br.com.megadoor.os.uninstall.desktop"
assert_nao_existe "$XDG_DATA_HOME/icons/hicolor/scalable/apps/br.com.megadoor.os.svg"

printf '%s\n' "Testes seguros do empacotamento Linux concluídos."
