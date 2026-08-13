#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

RAIZ_DO_PROJETO="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)"
CONFIGURACAO="$RAIZ_DO_PROJETO/packaging/distribution.config.json"
SAIDA="${MEGADOOR_LINUX_OUTPUT_DIR:-$RAIZ_DO_PROJETO/release/linux}"
CACHE="${MEGADOOR_PACKAGING_CACHE_DIR:-$RAIZ_DO_PROJETO/packaging/.cache}"

for comando in node npm git curl sha256sum tar xz mktemp rg; do
  command -v "$comando" >/dev/null 2>&1 || {
    printf 'Comando obrigatório ausente: %s\n' "$comando" >&2
    exit 1
  }
done

readarray -t CONSTANTES < <(
  node -e '
    const fs = require("fs");
    const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    for (const value of [
      c.application.version,
      c.runtime.nodeVersion,
      c.runtime.nodeLinuxX64Sha256,
      c.repository.releaseTag,
      c.linux.architecture,
      c.linux.localApplicationPort,
      c.configurationSchemaVersion,
    ]) console.log(value);
  ' "$CONFIGURACAO"
)

VERSAO="${CONSTANTES[0]}"
VERSAO_NODE="${CONSTANTES[1]}"
HASH_NODE="${CONSTANTES[2]}"
TAG="${CONSTANTES[3]}"
ARQUITETURA="${CONSTANTES[4]}"
PORTA_LOCAL="${CONSTANTES[5]}"
VERSAO_CONFIGURACAO="${CONSTANTES[6]}"
COMMIT_ATUAL="$(git -C "$RAIZ_DO_PROJETO" rev-parse HEAD)"
COMMIT="${MEGADOOR_RELEASE_COMMIT:-$COMMIT_ATUAL}"

[[ "$ARQUITETURA" == "x64" ]] || { printf '%s\n' "Arquitetura Linux não suportada." >&2; exit 1; }
[[ "$TAG" == "v$VERSAO" ]] || { printf '%s\n' "A tag e a versão da aplicação divergem." >&2; exit 1; }
[[ "$HASH_NODE" =~ ^[a-f0-9]{64}$ ]] || { printf '%s\n' "SHA-256 do Node inválido." >&2; exit 1; }
[[ "$COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || {
  printf '%s\n' "MEGADOOR_RELEASE_COMMIT deve ser um SHA Git completo." >&2
  exit 1
}
[[ "$PORTA_LOCAL" =~ ^[0-9]+$ ]] && (( PORTA_LOCAL >= 1 && PORTA_LOCAL <= 65535 )) || {
  printf '%s\n' "Porta local inválida na configuração central." >&2
  exit 1
}

if [[ "${MEGADOOR_ALLOW_DIRTY_RELEASE:-0}" != "1" ]]; then
  [[ -z "$(git -C "$RAIZ_DO_PROJETO" status --porcelain --untracked-files=all)" ]] || {
    printf '%s\n' "O worktree precisa estar limpo para gerar uma release oficial." >&2
    exit 1
  }
  TAG_COMMIT="$(git -C "$RAIZ_DO_PROJETO" rev-parse "${TAG}^{commit}" 2>/dev/null)" || {
    printf 'A tag %s ainda não existe.\n' "$TAG" >&2
    exit 1
  }
  [[ "$TAG_COMMIT" == "$COMMIT" ]] || {
    printf 'A tag %s não aponta para o commit da release.\n' "$TAG" >&2
    exit 1
  }
fi

TEMP="$(mktemp -d "${TMPDIR:-/tmp}/megadoor-linux-build.XXXXXXXX")"
trap 'rm -rf -- "$TEMP"' EXIT INT TERM
PAYLOAD="$TEMP/payload"
mkdir -p -- "$PAYLOAD/app" "$PAYLOAD/assets" "$PAYLOAD/bin" "$PAYLOAD/runtime" "$PAYLOAD/server" "$CACHE" "$SAIDA"

printf '%s\n' "Compilando o frontend Vue em modo REAL..."
(
  cd -- "$RAIZ_DO_PROJETO"
  export VITE_MODO_APLICACAO=REAL
  export VITE_USAR_EMULADORES=false
  export VITE_USAR_CONFIGURACAO_RUNTIME=true
  npm run build
)
FIREBASE_PROJECT_ID="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).firebase.projectId' "$CONFIGURACAO")"
[[ -f "$RAIZ_DO_PROJETO/dist/index.html" ]] || {
  printf '%s\n' "O Vite não produziu dist/index.html." >&2
  exit 1
}
rg -Fq "$FIREBASE_PROJECT_ID" "$RAIZ_DO_PROJETO/dist" || {
  printf '%s\n' "O build não contém o projeto Firebase esperado." >&2
  exit 1
}
cp -a -- "$RAIZ_DO_PROJETO/dist/." "$PAYLOAD/app/"

printf '%s\n' "Obtendo Node.js $VERSAO_NODE para Linux x64..."
ARQUIVO_NODE="$CACHE/node-v$VERSAO_NODE-linux-x64.tar.xz"
URL_NODE="https://nodejs.org/dist/v$VERSAO_NODE/node-v$VERSAO_NODE-linux-x64.tar.xz"
if [[ ! -f "$ARQUIVO_NODE" ]] || [[ "$(sha256sum "$ARQUIVO_NODE" | awk '{print $1}')" != "$HASH_NODE" ]]; then
  PARCIAL="$ARQUIVO_NODE.partial"
  rm -f -- "$PARCIAL"
  curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --retry-delay 1 \
    --output "$PARCIAL" "$URL_NODE"
  [[ "$(sha256sum "$PARCIAL" | awk '{print $1}')" == "$HASH_NODE" ]] || {
    rm -f -- "$PARCIAL"
    printf '%s\n' "O SHA-256 do runtime Node baixado diverge do esperado." >&2
    exit 1
  }
  mv -- "$PARCIAL" "$ARQUIVO_NODE"
fi

mkdir -p -- "$TEMP/node"
tar -xJf "$ARQUIVO_NODE" -C "$TEMP/node"
RAIZ_NODE="$TEMP/node/node-v$VERSAO_NODE-linux-x64"
[[ "$($RAIZ_NODE/bin/node --version)" == "v$VERSAO_NODE" ]] || {
  printf '%s\n' "O executável Node extraído possui versão incompatível." >&2
  exit 1
}
mkdir -p -- "$PAYLOAD/runtime/bin"
cp -- "$RAIZ_NODE/bin/node" "$PAYLOAD/runtime/bin/node"
cp -- "$RAIZ_NODE/LICENSE" "$PAYLOAD/runtime/LICENSE"
chmod 700 -- "$PAYLOAD/runtime/bin/node"

cp -- "$RAIZ_DO_PROJETO/packaging/assets/megadoor-icon.svg" "$PAYLOAD/assets/"
cp -- "$RAIZ_DO_PROJETO/packaging/distribution.config.json" "$PAYLOAD/distribution.config.json"
cp -- "$RAIZ_DO_PROJETO/packaging/windows/runtime/static-server.mjs" "$PAYLOAD/server/"
node "$RAIZ_DO_PROJETO/packaging/scripts/gerar-avisos-de-terceiros.mjs" \
  "$PAYLOAD/THIRD-PARTY-NOTICES.txt"
cp -- "$RAIZ_DO_PROJETO/packaging/linux/runtime/installer-support.mjs" "$PAYLOAD/bin/"
cp -- "$RAIZ_DO_PROJETO/packaging/linux/runtime/linux-launcher.mjs" "$PAYLOAD/bin/"
cp -- "$RAIZ_DO_PROJETO/packaging/linux/runtime/megadoor" "$PAYLOAD/bin/"
cp -- "$RAIZ_DO_PROJETO/packaging/linux/runtime/megadoor-uninstall" "$PAYLOAD/bin/"
chmod 700 -- "$PAYLOAD/bin/megadoor" "$PAYLOAD/bin/megadoor-uninstall"

MEGADOOR_RELEASE_COMMIT="$COMMIT" \
  "$PAYLOAD/runtime/bin/node" "$RAIZ_DO_PROJETO/packaging/scripts/gerar-manifesto.mjs" \
  "$PAYLOAD" "linux-x64"
"$PAYLOAD/runtime/bin/node" "$PAYLOAD/bin/installer-support.mjs" \
  validate-payload "$PAYLOAD" "linux-x64" >/dev/null

NOME_PAYLOAD="Megadoor-$VERSAO-linux-x64.tar.xz"
NOME_INSTALADOR="Megadoor-Installer-$VERSAO-linux-x64.tar.xz"
PAYLOAD_FINAL="$SAIDA/$NOME_PAYLOAD"
INSTALADOR_FINAL="$SAIDA/$NOME_INSTALADOR"

tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  -C "$TEMP" -cJf "$PAYLOAD_FINAL" payload

PACOTE_INSTALADOR="$TEMP/installer"
mkdir -p -- "$PACOTE_INSTALADOR"
cp -- "$RAIZ_DO_PROJETO/packaging/linux/Instalar-Megadoor.sh" "$PACOTE_INSTALADOR/"
cp -a -- "$PAYLOAD" "$PACOTE_INSTALADOR/payload"
chmod 755 -- "$PACOTE_INSTALADOR/Instalar-Megadoor.sh"
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  -C "$TEMP" -cJf "$INSTALADOR_FINAL" installer

(cd -- "$SAIDA" && sha256sum "$NOME_PAYLOAD" "$NOME_INSTALADOR" >checksums-linux-x64.sha256)

printf '%s\n' \
  "Release Linux criada:" \
  "  $PAYLOAD_FINAL" \
  "  $INSTALADOR_FINAL" \
  "  $SAIDA/checksums-linux-x64.sha256"
