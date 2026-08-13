#!/usr/bin/env bash

set -Eeuo pipefail

readonly NOME_APLICACAO="Megadoor"
readonly VERSAO_NODE="24.19.0"
readonly ARQUIVO_NODE="node-v${VERSAO_NODE}-linux-x64.tar.xz"
readonly URL_NODE="https://nodejs.org/dist/v${VERSAO_NODE}/${ARQUIVO_NODE}"
readonly SHA256_NODE="14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647"
readonly RAIZ_PROJETO="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly RAIZ_RUNTIME="${RAIZ_PROJETO}/.runtime"
readonly NODE_LOCAL="${RAIZ_RUNTIME}/node"
readonly NODE_ANTERIOR="${RAIZ_RUNTIME}/node.anterior"
readonly LOG_INSTALACAO="${RAIZ_RUNTIME}/instalacao.log"
readonly ICONE="${RAIZ_PROJETO}/assets/icons/megadoor-icon.svg"
readonly ATALHO_APLICACOES="${XDG_DATA_HOME:-${HOME}/.local/share}/applications/megadoor.desktop"

TEMPORARIO=""
PROCESSO_ANIMADO=""

cor() { printf '\033[%sm' "$1"; }

informar() {
  printf '%s[Megadoor]%s %s\n' "$(cor '1;36')" "$(cor 0)" "$1"
}

falhar() {
  printf '\n%s[Megadoor] ERRO:%s %s\n' "$(cor '1;31')" "$(cor 0)" "$1" >&2
  exit 1
}

barra() {
  local rotulo=$1 percentual=$2 largura=30 preenchido vazio
  ((percentual < 0)) && percentual=0
  ((percentual > 100)) && percentual=100
  preenchido=$((percentual * largura / 100))
  vazio=$((largura - preenchido))
  printf -v parte_preenchida '%*s' "$preenchido" ''
  printf -v parte_vazia '%*s' "$vazio" ''
  printf '\r%s[%-30s]%s %3d%%  %s' \
    "$(cor '1;33')" "${parte_preenchida// /#}${parte_vazia// /-}" "$(cor 0)" \
    "$percentual" "$rotulo"
}

concluir_etapa() {
  barra "$1" 100
  printf '  %sOK%s\n' "$(cor '1;32')" "$(cor 0)"
}

executar_animado() {
  local rotulo=$1
  shift
  local log_etapa="${TEMPORARIO}/etapa-$RANDOM.log" percentual=7 codigo=0 quadro=0
  local -a indicador=('|' '/' '-' '\\')

  "$@" >"$log_etapa" 2>&1 &
  PROCESSO_ANIMADO=$!
  while kill -0 "$PROCESSO_ANIMADO" 2>/dev/null; do
    barra "$rotulo ${indicador[$((quadro % 4))]}" "$percentual"
    quadro=$((quadro + 1))
    percentual=$((percentual + 3))
    ((percentual > 91)) && percentual=91
    sleep 0.12
  done
  wait "$PROCESSO_ANIMADO" || codigo=$?
  PROCESSO_ANIMADO=""

  if ((codigo != 0)); then
    printf '\n' >&2
    cat "$log_etapa" >>"$LOG_INSTALACAO" || true
    tail -n 30 "$log_etapa" >&2 || true
    falhar "$rotulo falhou (código $codigo). Consulte $LOG_INSTALACAO."
  fi
  cat "$log_etapa" >>"$LOG_INSTALACAO"
  concluir_etapa "$rotulo"
}

limpar() {
  local codigo=$?
  trap - EXIT INT TERM HUP
  if [[ -n "$PROCESSO_ANIMADO" ]] && kill -0 "$PROCESSO_ANIMADO" 2>/dev/null; then
    kill -TERM "$PROCESSO_ANIMADO" 2>/dev/null || true
    for _ in {1..30}; do
      kill -0 "$PROCESSO_ANIMADO" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$PROCESSO_ANIMADO" 2>/dev/null; then
      kill -KILL "$PROCESSO_ANIMADO" 2>/dev/null || true
    fi
    wait "$PROCESSO_ANIMADO" 2>/dev/null || true
  fi
  if [[ -d "$NODE_ANTERIOR" ]]; then
    if [[ -e "$NODE_LOCAL" ]]; then
      rm -rf -- "$NODE_ANTERIOR"
    else
      mv -- "$NODE_ANTERIOR" "$NODE_LOCAL" 2>/dev/null || true
    fi
  fi
  [[ -z "$TEMPORARIO" || ! -d "$TEMPORARIO" ]] || rm -rf -- "$TEMPORARIO"
  exit "$codigo"
}
trap limpar EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

exigir_arquivo() {
  [[ -f "${RAIZ_PROJETO}/$1" ]] ||
    falhar "Arquivo ausente: $1. Extraia integralmente o ZIP baixado do GitHub."
}

instalar_ferramentas_sistema() {
  local faltando=0 gerenciador
  command -v curl >/dev/null 2>&1 || faltando=1
  command -v tar >/dev/null 2>&1 || faltando=1
  command -v xz >/dev/null 2>&1 || faltando=1
  command -v sha256sum >/dev/null 2>&1 || faltando=1
  command -v grep >/dev/null 2>&1 || faltando=1
  command -v sed >/dev/null 2>&1 || faltando=1
  command -v xdg-open >/dev/null 2>&1 || faltando=1
  command -v xdg-user-dir >/dev/null 2>&1 || faltando=1
  command -v setsid >/dev/null 2>&1 || faltando=1
  [[ -r /etc/ssl/certs/ca-certificates.crt ]] || faltando=1

  if ((faltando == 0)); then
    concluir_etapa "Verificando ferramentas do sistema"
    return
  fi

  for gerenciador in apt-get dnf pacman zypper; do
    command -v "$gerenciador" >/dev/null 2>&1 && break
    gerenciador=""
  done
  [[ -n "$gerenciador" ]] ||
    falhar "Há ferramentas do sistema ausentes e nenhum gerenciador compatível (apt, dnf, pacman ou zypper) foi encontrado."

  local -a privilegio=()
  if ((EUID != 0)); then
    command -v sudo >/dev/null 2>&1 || falhar "O comando sudo é necessário para instalar as ferramentas do sistema."
    privilegio=(sudo)
  fi

  case "$gerenciador" in
    apt-get)
      executar_animado "Atualizando a lista de pacotes" "${privilegio[@]}" apt-get update
      executar_animado "Instalando ferramentas do sistema" "${privilegio[@]}" apt-get install \
        -y --no-install-recommends curl ca-certificates tar xz-utils coreutils grep sed xdg-utils xdg-user-dirs util-linux
      ;;
    dnf)
      executar_animado "Instalando ferramentas do sistema" "${privilegio[@]}" dnf install -y \
        curl ca-certificates tar xz coreutils grep sed xdg-utils xdg-user-dirs util-linux
      ;;
    pacman)
      executar_animado "Instalando ferramentas do sistema" "${privilegio[@]}" pacman -Sy \
        --needed --noconfirm curl ca-certificates tar xz coreutils grep sed xdg-utils xdg-user-dirs util-linux
      ;;
    zypper)
      executar_animado "Instalando ferramentas do sistema" "${privilegio[@]}" zypper \
        --non-interactive install curl ca-certificates tar xz coreutils grep sed xdg-utils xdg-user-dirs util-linux
      ;;
  esac
}

valor_env() {
  local chave=$1 arquivo linha valor
  for arquivo in "${RAIZ_PROJETO}/.env.local" "${RAIZ_PROJETO}/.env.production"; do
    [[ -f "$arquivo" ]] || continue
    linha=$(grep -E "^[[:space:]]*${chave}=" "$arquivo" | tail -n 1 || true)
    [[ -n "$linha" ]] || continue
    valor=${linha#*=}
    valor=${valor%$'\r'}
    if [[ $valor == \"*\" && $valor == *\" ]]; then valor=${valor:1:${#valor}-2}; fi
    if [[ $valor == \'*\' && $valor == *\' ]]; then valor=${valor:1:${#valor}-2}; fi
    printf '%s' "$valor"
    return 0
  done
  return 1
}

verificar_firebase() {
  local chave_api id_projeto numero_projeto resposta chave
  for chave in \
    VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID; do
    [[ -n "$(valor_env "$chave" || true)" ]] ||
      falhar "A configuração pública do Firebase está incompleta: falta $chave."
  done
  chave_api=$(valor_env VITE_FIREBASE_API_KEY || true)
  id_projeto=$(valor_env VITE_FIREBASE_PROJECT_ID || true)
  numero_projeto=$(valor_env VITE_FIREBASE_MESSAGING_SENDER_ID || true)
  [[ "$id_projeto" == "megadoor-os-system" ]] ||
    falhar "O projeto Firebase configurado não é megadoor-os-system."

  resposta=$(curl --silent --show-error --fail --max-time 20 \
    "https://identitytoolkit.googleapis.com/v1/projects?key=${chave_api}") ||
    falhar "Não foi possível conectar ao Firebase. Verifique a internet e tente novamente."
  MEGADOOR_NUMERO_PROJETO="$numero_projeto" "${NODE_LOCAL}/bin/node" -e '
    let conteudo = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (parte) => (conteudo += parte));
    process.stdin.on("end", () => {
      try {
        const resposta = JSON.parse(conteudo);
        process.exit(String(resposta.projectId) === process.env.MEGADOOR_NUMERO_PROJETO ? 0 : 1);
      } catch {
        process.exit(1);
      }
    });
  ' <<<"$resposta" ||
    falhar "O Firebase respondeu, mas a configuração não corresponde ao projeto esperado."
}

java_21_disponivel() {
  command -v java >/dev/null 2>&1 || return 1
  local versao major
  versao=$(java -version 2>&1 | head -n 1)
  major=$(sed -nE 's/.*version "([0-9]+).*/\1/p' <<<"$versao")
  [[ $major =~ ^[0-9]+$ ]] && ((major >= 21))
}

preparar_java_se_necessario() {
  local modo
  modo=$(valor_env VITE_MODO_APLICACAO || true)
  if [[ ${modo^^} != EMULADORES ]]; then
    concluir_etapa "Verificando dependências do modo configurado"
    return
  fi
  if java_21_disponivel; then
    concluir_etapa "Verificando Java 21"
    return
  fi

  local -a privilegio=()
  if ((EUID != 0)); then
    command -v sudo >/dev/null 2>&1 || falhar "sudo é necessário para instalar Java 21."
    privilegio=(sudo)
  fi
  if command -v apt-get >/dev/null 2>&1; then
    executar_animado "Atualizando pacotes para instalar Java" "${privilegio[@]}" apt-get update
    executar_animado "Instalando Java 21 para os emuladores" \
      "${privilegio[@]}" apt-get install -y --no-install-recommends openjdk-21-jre-headless
  elif command -v dnf >/dev/null 2>&1; then
    executar_animado "Instalando Java 21 para os emuladores" \
      "${privilegio[@]}" dnf install -y java-21-openjdk-headless
  elif command -v pacman >/dev/null 2>&1; then
    executar_animado "Instalando Java 21 para os emuladores" \
      "${privilegio[@]}" pacman -Sy --needed --noconfirm jre21-openjdk-headless
  elif command -v zypper >/dev/null 2>&1; then
    executar_animado "Instalando Java 21 para os emuladores" \
      "${privilegio[@]}" zypper --non-interactive install java-21-openjdk-headless
  else
    falhar "O modo EMULADORES requer Java 21 e nenhum gerenciador compatível foi encontrado."
  fi
}

preparar_node() {
  if [[ -d "$NODE_ANTERIOR" ]]; then
    if [[ -e "$NODE_LOCAL" ]]; then
      rm -rf -- "$NODE_ANTERIOR"
    else
      mv -- "$NODE_ANTERIOR" "$NODE_LOCAL"
    fi
  fi
  if [[ -x "${NODE_LOCAL}/bin/node" ]] &&
    [[ "$("${NODE_LOCAL}/bin/node" --version)" == "v${VERSAO_NODE}" ]]; then
    concluir_etapa "Verificando Node.js privado ${VERSAO_NODE}"
    return
  fi

  local arquivo_node="${TEMPORARIO}/${ARQUIVO_NODE}"
  executar_animado "Baixando Node.js privado ${VERSAO_NODE}" \
    curl --fail --location --retry 2 --connect-timeout 15 --output "$arquivo_node" "$URL_NODE"
  printf '%s  %s\n' "$SHA256_NODE" "$arquivo_node" | sha256sum --check --status ||
    falhar "O Node.js baixado não passou na verificação SHA-256."
  concluir_etapa "Validando integridade do Node.js"

  local extracao="${TEMPORARIO}/node"
  mkdir -p -- "$extracao"
  executar_animado "Extraindo Node.js" tar -xJf "$arquivo_node" -C "$extracao"
  local origem="${extracao}/node-v${VERSAO_NODE}-linux-x64"
  [[ -x "${origem}/bin/npm" ]] || falhar "O pacote Node.js extraído está incompleto."

  local novo="${RAIZ_RUNTIME}/node.novo"
  rm -rf -- "$novo"
  rm -rf -- "$NODE_ANTERIOR"
  mv -- "$origem" "$novo"
  if [[ -e "$NODE_LOCAL" ]]; then
    mv -- "$NODE_LOCAL" "$NODE_ANTERIOR"
  fi
  if ! mv -- "$novo" "$NODE_LOCAL"; then
    if [[ -d "$NODE_ANTERIOR" && ! -e "$NODE_LOCAL" ]]; then
      mv -- "$NODE_ANTERIOR" "$NODE_LOCAL" || true
    fi
    falhar "Não foi possível ativar o novo runtime Node.js; a instalação anterior foi restaurada."
  fi
  rm -rf -- "$NODE_ANTERIOR"
  concluir_etapa "Instalando Node.js privado"
}

criar_atalho() {
  local desktop caminho_execucao
  xdg-user-dirs-update >/dev/null 2>&1 || true
  desktop=$(xdg-user-dir DESKTOP 2>/dev/null || true)
  [[ -n "$desktop" && $desktop == /* && "$desktop" != "$HOME" ]] ||
    falhar "Não foi possível descobrir a Área de Trabalho real com xdg-user-dir."
  [[ "$ATALHO_APLICACOES" == /* ]] ||
    falhar "XDG_DATA_HOME precisa ser um caminho absoluto para criar o atalho."
  mkdir -p -- "$desktop" "$(dirname -- "$ATALHO_APLICACOES")"

  # O campo Exec possui duas camadas de escape: a do arquivo .desktop e a
  # da própria linha de comando. Isso mantém válidos espaços, $, crase,
  # aspas, barras invertidas e o código especial %.
  caminho_execucao=${RAIZ_PROJETO//\\/\\\\\\\\}
  caminho_execucao=${caminho_execucao//\"/\\\\\\\"}
  caminho_execucao=${caminho_execucao//\$/\\\\\$}
  caminho_execucao=${caminho_execucao//\`/\\\\\`}
  caminho_execucao=${caminho_execucao//\%/%%}

  cat >"$ATALHO_APLICACOES" <<ATALHO
[Desktop Entry]
Type=Application
Version=1.0
Name=Megadoor
Comment=Abrir o Megadoor OS
Exec=/bin/bash "${caminho_execucao}/START.sh" REAL
Icon=${ICONE}
Terminal=true
Categories=Office;
StartupNotify=true
ATALHO
  chmod 0755 "$ATALHO_APLICACOES"
  if command -v desktop-file-validate >/dev/null 2>&1; then
    desktop-file-validate "$ATALHO_APLICACOES" ||
      falhar "O atalho Linux gerado não passou na validação do sistema."
  fi
  cp -- "$ATALHO_APLICACOES" "${desktop}/Megadoor.desktop"
  chmod 0755 "${desktop}/Megadoor.desktop"
  if command -v gio >/dev/null 2>&1; then
    gio set "${desktop}/Megadoor.desktop" metadata::trusted true >/dev/null 2>&1 || true
  fi
  concluir_etapa "Criando atalho na Área de Trabalho"
}

[[ $(uname -s) == Linux ]] || falhar "Execute BASH-INSTALLER.sh em um sistema Linux."
[[ $(uname -m) == x86_64 ]] || falhar "Este instalador requer Linux x86_64."
((BASH_VERSINFO[0] >= 4)) || falhar "Este instalador requer Bash 4 ou superior."
[[ "$RAIZ_PROJETO" != *%* ]] ||
  falhar "Mova a pasta extraída para um caminho sem o caractere % e execute o instalador novamente."

for arquivo in package.json package-lock.json START.sh .env.production assets/icons/megadoor-icon.svg; do
  exigir_arquivo "$arquivo"
done

mkdir -p -- "$RAIZ_RUNTIME"
: >"$LOG_INSTALACAO"
TEMPORARIO=$(mktemp -d "${TMPDIR:-/tmp}/megadoor-installer.XXXXXXXX")

printf '\n%sInstalador do Megadoor para Linux%s\n' "$(cor '1;36')" "$(cor 0)"
printf 'Projeto: %s\n\n' "$RAIZ_PROJETO"

instalar_ferramentas_sistema
preparar_node

if [[ ! -f "${RAIZ_PROJETO}/.env.local" ]]; then
  cp -- "${RAIZ_PROJETO}/.env.production" "${RAIZ_PROJETO}/.env.local"
fi
concluir_etapa "Preparando configuração local"

export PATH="${NODE_LOCAL}/bin:${PATH}"
executar_animado "Instalando dependências npm" \
  npm ci --prefix "$RAIZ_PROJETO" --no-audit --no-fund

verificar_firebase
concluir_etapa "Verificando conexão com o Firebase"

preparar_java_se_necessario

chmod 0755 "${RAIZ_PROJETO}/START.sh"
criar_atalho

printf '\n%sInstalação concluída.%s\n' "$(cor '1;32')" "$(cor 0)"
printf 'Use o atalho Megadoor na Área de Trabalho. Ele executará START.sh e abrirá o navegador.\n'
printf 'Não mova nem exclua esta pasta; o atalho aponta para: %s\n' "$RAIZ_PROJETO"
printf 'A FastAPI não foi testada; ela pode ser configurada e conectada posteriormente.\n'
