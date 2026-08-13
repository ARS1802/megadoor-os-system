#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

NOME="Megadoor"
ID_APLICACAO="br.com.megadoor.os"
PLATAFORMA="linux-x64"
PAYLOAD=""
IP_SERVIDOR=""
PORTA_SERVIDOR="8443"
ATALHO_DESKTOP=""
NAO_INTERATIVO=0

uso() {
  printf '%s\n' \
    "Uso: ./Instalar-Megadoor.sh [opções]" \
    "  --payload <diretório>       payload local; o padrão é ./payload" \
    "  --server-ip <IPv4>          endereço da FastAPI" \
    "  --server-port <porta>       porta HTTPS da FastAPI (padrão: 8443)" \
    "  --desktop-shortcut          cria também um atalho no Desktop" \
    "  --no-desktop-shortcut       não cria atalho no Desktop" \
    "  --non-interactive           recusa valores obrigatórios ausentes"
}

while (($#)); do
  case "$1" in
    --payload)
      [[ $# -ge 2 ]] || { printf '%s\n' "--payload exige um diretório." >&2; exit 2; }
      PAYLOAD="$2"
      shift 2
      ;;
    --server-ip)
      [[ $# -ge 2 ]] || { printf '%s\n' "--server-ip exige um IPv4." >&2; exit 2; }
      IP_SERVIDOR="$2"
      shift 2
      ;;
    --server-port)
      [[ $# -ge 2 ]] || { printf '%s\n' "--server-port exige uma porta." >&2; exit 2; }
      PORTA_SERVIDOR="$2"
      shift 2
      ;;
    --desktop-shortcut)
      ATALHO_DESKTOP=1
      shift
      ;;
    --no-desktop-shortcut)
      ATALHO_DESKTOP=0
      shift
      ;;
    --non-interactive)
      NAO_INTERATIVO=1
      shift
      ;;
    --help|-h)
      uso
      exit 0
      ;;
    *)
      printf 'Argumento desconhecido: %s\n' "$1" >&2
      uso >&2
      exit 2
      ;;
  esac
done

if (( EUID == 0 )); then
  printf '%s\n' "Não execute o instalador do Megadoor com sudo." >&2
  exit 1
fi
if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  printf '%s\n' "Esta distribuição suporta somente Linux x86_64." >&2
  exit 1
fi

for comando in sha256sum find mktemp cp mv ln readlink; do
  command -v "$comando" >/dev/null 2>&1 || {
    printf 'Comando obrigatório ausente: %s\n' "$comando" >&2
    exit 1
  }
done

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
[[ -n "$PAYLOAD" ]] || PAYLOAD="$SCRIPT_DIR/payload"
PAYLOAD="$(CDPATH= cd -- "$PAYLOAD" 2>/dev/null && pwd -P)" || {
  printf '%s\n' "O payload informado não existe." >&2
  exit 1
}

if [[ ! -f "$PAYLOAD/files.sha256" || ! -f "$PAYLOAD/payload-manifest.json" ]]; then
  printf '%s\n' "O pacote do Megadoor está incompleto." >&2
  exit 1
fi
if [[ -n "$(find "$PAYLOAD" -type l -print -quit)" ]]; then
  printf '%s\n' "O payload contém links simbólicos e foi recusado." >&2
  exit 1
fi

validar_ipv4() {
  local ip="$1" parte numero
  local -a partes
  [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  IFS='.' read -r -a partes <<<"$ip"
  for parte in "${partes[@]}"; do
    [[ "$parte" == "0" || "$parte" != 0* ]] || return 1
    numero=$((10#$parte))
    (( numero >= 0 && numero <= 255 )) || return 1
  done
  [[ "$ip" != "0.0.0.0" && "$ip" != "255.255.255.255" ]]
}

validar_porta() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

while ! validar_ipv4 "$IP_SERVIDOR"; do
  if (( NAO_INTERATIVO == 1 )); then
    printf '%s\n' "Informe um IPv4 válido usando --server-ip." >&2
    exit 2
  fi
  printf 'Endereço IPv4 do servidor FastAPI: '
  read -r IP_SERVIDOR
  validar_ipv4 "$IP_SERVIDOR" || printf '%s\n' "IPv4 inválido. Tente novamente."
done

while ! validar_porta "$PORTA_SERVIDOR"; do
  if (( NAO_INTERATIVO == 1 )); then
    printf '%s\n' "Informe uma porta válida usando --server-port." >&2
    exit 2
  fi
  printf 'Porta HTTPS do servidor FastAPI [8443]: '
  read -r PORTA_SERVIDOR
  [[ -n "$PORTA_SERVIDOR" ]] || PORTA_SERVIDOR=8443
  validar_porta "$PORTA_SERVIDOR" || printf '%s\n' "Porta inválida. Tente novamente."
done

if [[ -z "$ATALHO_DESKTOP" ]]; then
  if (( NAO_INTERATIVO == 0 )) && [[ -t 0 ]]; then
    printf 'Criar também um atalho no Desktop? [s/N] '
    read -r resposta
    [[ "$resposta" =~ ^[Ss]$ ]] && ATALHO_DESKTOP=1 || ATALHO_DESKTOP=0
  else
    ATALHO_DESKTOP=0
  fi
fi

if [[ -n "${XDG_DATA_HOME:-}" && "$XDG_DATA_HOME" == /* ]]; then
  RAIZ_DOS_DADOS="$XDG_DATA_HOME"
else
  RAIZ_DOS_DADOS="$HOME/.local/share"
fi
if [[ -n "${XDG_CONFIG_HOME:-}" && "$XDG_CONFIG_HOME" == /* ]]; then
  BASE_CONFIGURACAO="$XDG_CONFIG_HOME"
else
  BASE_CONFIGURACAO="$HOME/.config"
fi
if [[ -n "${XDG_STATE_HOME:-}" && "$XDG_STATE_HOME" == /* ]]; then
  BASE_ESTADO="$XDG_STATE_HOME"
else
  BASE_ESTADO="$HOME/.local/state"
fi
if [[ -n "${XDG_BIN_HOME:-}" && "$XDG_BIN_HOME" == /* ]]; then
  DIRETORIO_BIN="$XDG_BIN_HOME"
else
  DIRETORIO_BIN="$HOME/.local/bin"
fi

RAIZ_DA_INSTALACAO="$RAIZ_DOS_DADOS/megadoor"
RAIZ_DA_CONFIGURACAO="$BASE_CONFIGURACAO/megadoor"
RAIZ_DO_ESTADO="$BASE_ESTADO/megadoor"
ARQUIVO_CONFIGURACAO="$RAIZ_DA_CONFIGURACAO/runtime-config.json"
ARQUIVO_ESTADO="$RAIZ_DA_INSTALACAO/install-state.json"
ARQUIVO_DESKTOP="$RAIZ_DOS_DADOS/applications/$ID_APLICACAO.desktop"
ARQUIVO_DESINSTALAR_DESKTOP="$RAIZ_DOS_DADOS/applications/$ID_APLICACAO.uninstall.desktop"
ARQUIVO_ICONE="$RAIZ_DOS_DADOS/icons/hicolor/scalable/apps/$ID_APLICACAO.svg"
LINK_LAUNCHER="$DIRETORIO_BIN/megadoor"
LINK_DESINSTALADOR="$DIRETORIO_BIN/megadoor-uninstall"
ATALHO_NO_DESKTOP=""

for caminho in "$RAIZ_DA_INSTALACAO" "$RAIZ_DA_CONFIGURACAO" "$RAIZ_DO_ESTADO"; do
  [[ "$caminho" == /* && "$caminho" != "/" && "$caminho" != *$'\n'* ]] || {
    printf 'Caminho de instalação inseguro: %s\n' "$caminho" >&2
    exit 1
  }
done

TEMP_BASE="${TMPDIR:-/tmp}"
STAGING="$(mktemp -d "$TEMP_BASE/megadoor-install.XXXXXXXX")"
LOG_TEMP="$STAGING/install.log"
INSTALACAO_CONCLUIDA=0
PROMOVIDO=0
BACKUP_DA_VERSAO=""
ALVO_DA_VERSAO=""
VERSAO_ATIVA_ANTERIOR=""
CONFIGURACAO_EXISTIA=0
ARTEFATOS_MODIFICADOS=0
ARTEFATOS_ANTERIORES="$STAGING/artefatos-anteriores"
mkdir -p -- "$ARTEFATOS_ANTERIORES"

log() {
  printf '%s [%s] %s\n' "$(date -Iseconds)" "$1" "$2" >>"$LOG_TEMP"
}

rollback() {
  local codigo="$?"
  set +e
  if (( INSTALACAO_CONCLUIDA == 0 )); then
    log ERROR "Instalação interrompida; iniciando rollback (código $codigo)."
    if (( PROMOVIDO == 1 )); then
      rm -f -- "$RAIZ_DA_INSTALACAO/current"
      if [[ -n "$VERSAO_ATIVA_ANTERIOR" ]]; then
        ln -s -- "$VERSAO_ATIVA_ANTERIOR" "$RAIZ_DA_INSTALACAO/current"
      fi
      [[ -n "$ALVO_DA_VERSAO" ]] && rm -rf -- "$ALVO_DA_VERSAO"
      if [[ -n "$BACKUP_DA_VERSAO" && -d "$BACKUP_DA_VERSAO" ]]; then
        mv -- "$BACKUP_DA_VERSAO" "$ALVO_DA_VERSAO"
      fi
    fi
    if (( CONFIGURACAO_EXISTIA == 1 )) && [[ -f "$STAGING/runtime-config.backup" ]]; then
      mkdir -p -- "$RAIZ_DA_CONFIGURACAO"
      cp -- "$STAGING/runtime-config.backup" "$ARQUIVO_CONFIGURACAO"
    elif (( CONFIGURACAO_EXISTIA == 0 )); then
      rm -f -- "$ARQUIVO_CONFIGURACAO"
    fi
    if (( ARTEFATOS_MODIFICADOS == 1 )); then
      for nome in launcher uninstaller desktop uninstall-desktop icon desktop-shortcut install-id install-state; do
        case "$nome" in
          launcher) destino="$LINK_LAUNCHER" ;;
          uninstaller) destino="$LINK_DESINSTALADOR" ;;
          desktop) destino="$ARQUIVO_DESKTOP" ;;
          uninstall-desktop) destino="$ARQUIVO_DESINSTALAR_DESKTOP" ;;
          icon) destino="$ARQUIVO_ICONE" ;;
          desktop-shortcut) destino="$ATALHO_NO_DESKTOP" ;;
          install-id) destino="$RAIZ_DO_ESTADO/install-id" ;;
          install-state) destino="$ARQUIVO_ESTADO" ;;
        esac
        [[ -n "$destino" ]] || continue
        rm -rf -- "$destino"
        if [[ -e "$ARTEFATOS_ANTERIORES/$nome" || -L "$ARTEFATOS_ANTERIORES/$nome" ]]; then
          mkdir -p -- "$(dirname -- "$destino")"
          cp -a -- "$ARTEFATOS_ANTERIORES/$nome" "$destino"
        fi
      done
    fi
    mkdir -p -- "$RAIZ_DO_ESTADO/logs"
    cp -- "$LOG_TEMP" "$RAIZ_DO_ESTADO/logs/install-falhou-$(date +%Y%m%d-%H%M%S).log" 2>/dev/null || true
  fi
  rm -rf -- "$STAGING"
  exit "$codigo"
}
trap rollback EXIT INT TERM

if [[ -f "$ARQUIVO_CONFIGURACAO" ]]; then
  CONFIGURACAO_EXISTIA=1
  cp -- "$ARQUIVO_CONFIGURACAO" "$STAGING/runtime-config.backup"
fi
for especificacao in \
  "launcher:$LINK_LAUNCHER" \
  "uninstaller:$LINK_DESINSTALADOR" \
  "desktop:$ARQUIVO_DESKTOP" \
  "uninstall-desktop:$ARQUIVO_DESINSTALAR_DESKTOP" \
  "icon:$ARQUIVO_ICONE" \
  "install-id:$RAIZ_DO_ESTADO/install-id" \
  "install-state:$ARQUIVO_ESTADO"; do
  nome="${especificacao%%:*}"
  caminho="${especificacao#*:}"
  if [[ -e "$caminho" || -L "$caminho" ]]; then
    cp -a -- "$caminho" "$ARTEFATOS_ANTERIORES/$nome"
  fi
done

log INFO "Validando payload em $PAYLOAD."
while IFS= read -r linha || [[ -n "$linha" ]]; do
  [[ "$linha" =~ ^[a-f0-9]{64}[[:space:]][[:space:]][A-Za-z0-9._/-]+$ ]] || {
    printf '%s\n' "Formato inválido em files.sha256." >&2
    exit 1
  }
  relativo="${linha#*  }"
  [[ "$relativo" != /* && "/$relativo/" != *"/../"* && "/$relativo/" != *"/./"* ]] || {
    printf '%s\n' "Caminho inseguro em files.sha256." >&2
    exit 1
  }
done <"$PAYLOAD/files.sha256"

(cd -- "$PAYLOAD" && sha256sum --check --strict --quiet files.sha256) || {
  printf '%s\n' "A verificação SHA-256 do pacote falhou." >&2
  exit 1
}

mkdir -p -- "$STAGING/payload"
cp -a -- "$PAYLOAD/." "$STAGING/payload/"
NODE_DO_PAYLOAD="$STAGING/payload/runtime/bin/node"
SUPORTE_DO_PAYLOAD="$STAGING/payload/bin/installer-support.mjs"
chmod 700 -- "$NODE_DO_PAYLOAD"

mapfile -t METADADOS < <(
  "$NODE_DO_PAYLOAD" "$SUPORTE_DO_PAYLOAD" validate-payload "$STAGING/payload" "$PLATAFORMA"
)
[[ ${#METADADOS[@]} -eq 4 ]] || {
  printf '%s\n' "O manifesto do pacote não retornou os metadados esperados." >&2
  exit 1
}
VERSAO="${METADADOS[0]}"
VERSAO_RUNTIME="${METADADOS[1]}"
VERSAO_CONFIGURACAO="${METADADOS[2]}"
PORTA_LOCAL="$(
  "$NODE_DO_PAYLOAD" -e '
    const fs = require("fs");
    const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!Number.isInteger(config.linux?.localApplicationPort)) process.exit(1);
    process.stdout.write(String(config.linux.localApplicationPort));
  ' "$STAGING/payload/distribution.config.json"
)" || {
  printf '%s\n' "O payload não contém as constantes Linux esperadas." >&2
  exit 1
}
[[ "$("$NODE_DO_PAYLOAD" --version)" == "v$VERSAO_RUNTIME" ]] || {
  printf '%s\n' "A versão do runtime privado diverge do manifesto." >&2
  exit 1
}

printf '%s\n' "Instalando $NOME $VERSAO..."
log INFO "Payload $VERSAO validado para $PLATAFORMA."

mkdir -p -- "$RAIZ_DA_INSTALACAO/versions" "$RAIZ_DA_CONFIGURACAO" "$RAIZ_DO_ESTADO/logs"
chmod 700 -- "$RAIZ_DA_CONFIGURACAO" "$RAIZ_DO_ESTADO" "$RAIZ_DO_ESTADO/logs" 2>/dev/null || true

if [[ -x "$LINK_DESINSTALADOR" ]]; then
  "$LINK_DESINSTALADOR" --stop-only || {
    printf '%s\n' "Feche o Megadoor antes de continuar a instalação." >&2
    exit 1
  }
fi

if [[ -L "$RAIZ_DA_INSTALACAO/current" ]]; then
  VERSAO_ATIVA_ANTERIOR="$(readlink -- "$RAIZ_DA_INSTALACAO/current")"
elif [[ -e "$RAIZ_DA_INSTALACAO/current" ]]; then
  printf '%s\n' "A instalação existente possui um marcador current inválido." >&2
  exit 1
fi

PENDENTE="$RAIZ_DA_INSTALACAO/versions/.${VERSAO}.pending.$$"
ALVO_DA_VERSAO="$RAIZ_DA_INSTALACAO/versions/$VERSAO"
rm -rf -- "$PENDENTE"
mkdir -p -- "$PENDENTE"
cp -a -- "$STAGING/payload/." "$PENDENTE/"
chmod 700 -- "$PENDENTE/runtime/bin/node" "$PENDENTE/bin/megadoor" "$PENDENTE/bin/megadoor-uninstall"

"$PENDENTE/runtime/bin/node" "$PENDENTE/bin/installer-support.mjs" \
  validate-payload "$PENDENTE" "$PLATAFORMA" >/dev/null

if [[ -e "$ALVO_DA_VERSAO" ]]; then
  BACKUP_DA_VERSAO="$RAIZ_DA_INSTALACAO/versions/.${VERSAO}.backup.$$"
  mv -- "$ALVO_DA_VERSAO" "$BACKUP_DA_VERSAO"
fi
mv -- "$PENDENTE" "$ALVO_DA_VERSAO"
ln -s -- "versions/$VERSAO" "$RAIZ_DA_INSTALACAO/.current.$$"
mv -Tf -- "$RAIZ_DA_INSTALACAO/.current.$$" "$RAIZ_DA_INSTALACAO/current"
PROMOVIDO=1

SUPORTE_INSTALADO="$ALVO_DA_VERSAO/bin/installer-support.mjs"
NODE_INSTALADO="$ALVO_DA_VERSAO/runtime/bin/node"

ID_INSTALACAO=""
if [[ -r "$ARQUIVO_ESTADO" ]]; then
  ID_INSTALACAO="$(
    "$NODE_INSTALADO" -e '
      const fs = require("fs");
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (typeof value.installationId !== "string") process.exit(1);
      process.stdout.write(value.installationId);
    ' "$ARQUIVO_ESTADO"
  )" || ID_INSTALACAO=""
elif [[ -r "$RAIZ_DO_ESTADO/install-id" ]]; then
  read -r ID_INSTALACAO <"$RAIZ_DO_ESTADO/install-id" || true
fi
if [[ ! "$ID_INSTALACAO" =~ ^[a-f0-9-]{36}$ ]]; then
  if [[ -r /proc/sys/kernel/random/uuid ]]; then
    read -r ID_INSTALACAO </proc/sys/kernel/random/uuid
  else
    ID_INSTALACAO="$("$ALVO_DA_VERSAO/runtime/bin/node" -e 'process.stdout.write(crypto.randomUUID())')"
  fi
fi
printf '%s\n' "$ID_INSTALACAO" >"$RAIZ_DO_ESTADO/install-id"
chmod 600 -- "$RAIZ_DO_ESTADO/install-id"

CONFIG_TEMP="$RAIZ_DA_CONFIGURACAO/.runtime-config.json.$$"
printf '{\n  "schemaVersion": %s,\n  "installationId": "%s",\n  "server": {\n    "address": "%s",\n    "port": %s\n  }\n}\n' \
  "$VERSAO_CONFIGURACAO" "$ID_INSTALACAO" "$IP_SERVIDOR" "$PORTA_SERVIDOR" >"$CONFIG_TEMP"
chmod 600 -- "$CONFIG_TEMP"
mv -f -- "$CONFIG_TEMP" "$ARQUIVO_CONFIGURACAO"

mkdir -p -- "$DIRETORIO_BIN" "$(dirname -- "$ARQUIVO_DESKTOP")" "$(dirname -- "$ARQUIVO_ICONE")"
for link in "$LINK_LAUNCHER" "$LINK_DESINSTALADOR"; do
  if [[ -e "$link" && ! -L "$link" ]]; then
    printf 'O caminho %s já existe e não pertence ao instalador.\n' "$link" >&2
    exit 1
  fi
done
ARTEFATOS_MODIFICADOS=1
ln -sfn -- "$RAIZ_DA_INSTALACAO/current/bin/megadoor" "$LINK_LAUNCHER"
ln -sfn -- "$RAIZ_DA_INSTALACAO/current/bin/megadoor-uninstall" "$LINK_DESINSTALADOR"

ICONE_TEMP="${ARQUIVO_ICONE}.$$"
cp -- "$ALVO_DA_VERSAO/assets/megadoor-icon.svg" "$ICONE_TEMP"
chmod 644 -- "$ICONE_TEMP"
mv -f -- "$ICONE_TEMP" "$ARQUIVO_ICONE"

"$NODE_INSTALADO" "$SUPORTE_INSTALADO" write-desktop \
  "$ARQUIVO_DESKTOP" "$NOME" "Sistema de ordens de serviço Megadoor" \
  "$LINK_LAUNCHER" "$ID_APLICACAO" "$ID_INSTALACAO" false
"$NODE_INSTALADO" "$SUPORTE_INSTALADO" write-desktop \
  "$ARQUIVO_DESINSTALAR_DESKTOP" "Desinstalar $NOME" "Remove o Megadoor deste usuário" \
  "$LINK_DESINSTALADOR" "$ID_APLICACAO" "$ID_INSTALACAO" true

if (( ATALHO_DESKTOP == 1 )) && command -v xdg-user-dir >/dev/null 2>&1; then
  DIRETORIO_DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || true)"
  if [[ "$DIRETORIO_DESKTOP" == /* && -d "$DIRETORIO_DESKTOP" ]]; then
    ATALHO_NO_DESKTOP="$DIRETORIO_DESKTOP/$NOME.desktop"
    if [[ -e "$ATALHO_NO_DESKTOP" || -L "$ATALHO_NO_DESKTOP" ]]; then
      cp -a -- "$ATALHO_NO_DESKTOP" "$ARTEFATOS_ANTERIORES/desktop-shortcut"
    fi
    "$NODE_INSTALADO" "$SUPORTE_INSTALADO" write-desktop \
      "$ATALHO_NO_DESKTOP" "$NOME" "Sistema de ordens de serviço Megadoor" \
      "$LINK_LAUNCHER" "$ID_APLICACAO" "$ID_INSTALACAO" false
    command -v gio >/dev/null 2>&1 && gio set "$ATALHO_NO_DESKTOP" metadata::trusted true >/dev/null 2>&1 || true
  else
    printf '%s\n' "O diretório do Desktop não está disponível; o atalho do menu foi criado."
  fi
fi

"$NODE_INSTALADO" "$SUPORTE_INSTALADO" write-install-state \
  "$ARQUIVO_ESTADO" "$ID_INSTALACAO" "$VERSAO" "$VERSAO_RUNTIME" \
  "$RAIZ_DA_INSTALACAO" "$RAIZ_DA_CONFIGURACAO" "$RAIZ_DO_ESTADO" \
  "$LINK_LAUNCHER" "$LINK_DESINSTALADOR" "$ARQUIVO_DESKTOP" "$ATALHO_NO_DESKTOP" "$ARQUIVO_ICONE" \
  "$PORTA_LOCAL" "$VERSAO_CONFIGURACAO"

"$LINK_LAUNCHER" --self-test
command -v update-desktop-database >/dev/null 2>&1 && \
  update-desktop-database "$RAIZ_DOS_DADOS/applications" >/dev/null 2>&1 || true

rm -rf -- "$BACKUP_DA_VERSAO"
LOG_FINAL="$RAIZ_DO_ESTADO/logs/install-$(date +%Y%m%d-%H%M%S).log"
log INFO "Instalação concluída com sucesso."
cp -- "$LOG_TEMP" "$LOG_FINAL"
chmod 600 -- "$LOG_FINAL"

INSTALACAO_CONCLUIDA=1
printf '%s\n' \
  "$NOME $VERSAO foi instalado com sucesso." \
  "Abra pelo menu de aplicativos ou execute: $LINK_LAUNCHER"
