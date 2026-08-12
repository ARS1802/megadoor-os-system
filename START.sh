#!/usr/bin/env bash
set -Eeuo pipefail

RAIZ_DO_FRONT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTA_FRONT=5173
PORTAS_EMULADORES=(4000 4400 4500 8080 9099 9150)
URL_APLICACAO="http://127.0.0.1:${PORTA_FRONT}"
URL_EMULADORES="http://127.0.0.1:4000"

ABRIR_NAVEGADOR=1
MODO_DE_VERIFICACAO=0
MODO_SOLICITADO=""
PROCESSOS=()
NOMES_DOS_PROCESSOS=()

informar() {
  printf '[Megadoor OS] %s\n' "$1"
}

falhar() {
  printf '[Megadoor OS] ERRO: %s\n' "$1" >&2
  exit 1
}

mostrar_ajuda() {
  cat <<'AJUDA'
Uso:
  ./START.sh [DEMO|EMULADORES|REAL] [opções]

Sem informar um modo, o script respeita a configuração de `.env.local`.

Opções:
  --sem-navegador  Inicia os serviços sem abrir o navegador.
  --verificar       Encerra tudo assim que os serviços ficarem disponíveis.
  -h, --help        Mostra esta ajuda.

Exemplos:
  ./START.sh
  ./START.sh DEMO
  ./START.sh EMULADORES
  ./START.sh REAL --sem-navegador

Use Ctrl+C para encerrar o Vue e, quando aplicável, os emuladores iniciados
por este script. A FastAPI é externa e nunca é iniciada ou modificada aqui.
AJUDA
}

for argumento in "$@"; do
  case "${argumento^^}" in
    DEMO|EMULADORES|REAL)
      [[ -z "$MODO_SOLICITADO" ]] || falhar "Informe somente um modo de execução."
      MODO_SOLICITADO="${argumento^^}"
      ;;
    --SEM-NAVEGADOR)
      ABRIR_NAVEGADOR=0
      ;;
    --VERIFICAR|--TESTE)
      MODO_DE_VERIFICACAO=1
      ABRIR_NAVEGADOR=0
      ;;
    -H|--HELP)
      mostrar_ajuda
      exit 0
      ;;
    *)
      falhar "Argumento desconhecido: $argumento. Use --help para consultar as opções."
      ;;
  esac
done

cd "$RAIZ_DO_FRONT"

exigir_comando() {
  command -v "$1" >/dev/null 2>&1 || falhar "O comando '$1' não está disponível."
}

exigir_comando node
exigir_comando npm
exigir_comando curl
exigir_comando setsid

node -e '
  const [maior, menor] = process.versions.node.split(".").map(Number);
  if (maior < 20 || (maior === 20 && menor < 19)) process.exit(1);
' || falhar "É necessário Node.js 20.19 ou superior. Versão atual: $(node --version)."

VERSAO_NPM="$(npm --version)"
node - "$VERSAO_NPM" <<'NODE' || falhar "É necessário npm 10 ou superior. Versão atual: $VERSAO_NPM."
const maior = Number(process.argv[2].split('.')[0]);
if (!Number.isInteger(maior) || maior < 10) process.exit(1);
NODE

if [[ ! -x node_modules/.bin/vite ]]; then
  informar "Instalando as dependências locais com npm ci..."
  npm ci
fi

MODO_APLICACAO="$({
  MEGADOOR_START_MODO="$MODO_SOLICITADO" node --input-type=module <<'NODE'
import { loadEnv } from "vite";

const carregado = loadEnv("development", process.cwd(), "");
const valor = (chave) => process.env[chave] ?? carregado[chave] ?? "";
const solicitado = (process.env.MEGADOOR_START_MODO ?? "").trim().toUpperCase();
const informado = solicitado || valor("VITE_MODO_APLICACAO").trim().toUpperCase();
const modos = ["DEMO", "EMULADORES", "REAL"];

if (informado && !modos.includes(informado)) {
  throw new Error(`VITE_MODO_APLICACAO inválido: ${informado}.`);
}

const chavesFirebase = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];
const configuracao = Object.fromEntries(chavesFirebase.map((chave) => [chave, valor(chave).trim()]));
if (solicitado === "EMULADORES") configuracao.VITE_FIREBASE_PROJECT_ID = "demo-megadoor";
const preenchidos = Object.values(configuracao).filter(Boolean).length;

let legado = valor("VITE_USAR_EMULADORES").trim().toLowerCase();
if (solicitado) legado = solicitado === "EMULADORES" ? "true" : "false";
if (legado && !["true", "false"].includes(legado)) {
  throw new Error("VITE_USAR_EMULADORES deve ser true ou false.");
}

const modo = informado || (preenchidos === 0 ? "DEMO" : legado === "true" ? "EMULADORES" : "REAL");
if (modo !== "DEMO" && preenchidos !== chavesFirebase.length) {
  throw new Error(`A configuração Firebase está incompleta para o modo ${modo}.`);
}
if (modo === "REAL" && configuracao.VITE_FIREBASE_PROJECT_ID !== "megadoor-os-system") {
  throw new Error("O modo REAL aceita somente o projeto megadoor-os-system.");
}
if (modo === "REAL" && legado === "true") {
  throw new Error("REAL não pode ser combinado com VITE_USAR_EMULADORES=true.");
}
if (modo === "EMULADORES" && legado === "false") {
  throw new Error("EMULADORES não pode ser combinado com VITE_USAR_EMULADORES=false.");
}
if (modo === "EMULADORES" && configuracao.VITE_FIREBASE_PROJECT_ID !== "demo-megadoor") {
  throw new Error("O modo EMULADORES deve usar VITE_FIREBASE_PROJECT_ID=demo-megadoor.");
}

process.stdout.write(modo);
NODE
} 2> >(sed 's/^/[Megadoor OS] /' >&2))" || falhar "Não foi possível determinar o modo da aplicação."

porta_esta_aberta() {
  local porta="$1"
  (exec 9<>"/dev/tcp/127.0.0.1/$porta") >/dev/null 2>&1
}

exigir_porta_livre() {
  local porta="$1"
  if porta_esta_aberta "$porta"; then
    falhar "A porta $porta já está em uso. Encerre o serviço existente e tente novamente."
  fi
}

exigir_porta_livre "$PORTA_FRONT"

if [[ "$MODO_APLICACAO" == "EMULADORES" ]]; then
  exigir_comando npx
  exigir_comando java
  for porta in "${PORTAS_EMULADORES[@]}"; do
    exigir_porta_livre "$porta"
  done
fi

iniciar_processo() {
  local nome="$1"
  shift
  informar "Iniciando $nome..."
  setsid "$@" &
  PROCESSOS+=("$!")
  NOMES_DOS_PROCESSOS+=("$nome")
}

processo_esta_ativo() {
  kill -0 "$1" 2>/dev/null
}

verificar_processos() {
  local indice
  for indice in "${!PROCESSOS[@]}"; do
    if ! processo_esta_ativo "${PROCESSOS[$indice]}"; then
      falhar "${NOMES_DOS_PROCESSOS[$indice]} foi encerrado antes de ficar disponível."
    fi
  done
}

encerrar_processos() {
  local codigo_saida=$?
  trap - EXIT INT TERM HUP

  if ((${#PROCESSOS[@]} > 0)); then
    informar "Encerrando os serviços iniciados por este script..."
  fi

  local pid
  for pid in "${PROCESSOS[@]}"; do
    if kill -0 -- "-$pid" 2>/dev/null; then
      kill -TERM -- "-$pid" 2>/dev/null || true
    fi
  done

  local tentativa algum_ativo
  for tentativa in {1..30}; do
    algum_ativo=0
    for pid in "${PROCESSOS[@]}"; do
      if kill -0 -- "-$pid" 2>/dev/null; then
        algum_ativo=1
      fi
    done
    ((algum_ativo == 0)) && break
    sleep 0.1
  done

  for pid in "${PROCESSOS[@]}"; do
    if kill -0 -- "-$pid" 2>/dev/null; then
      kill -KILL -- "-$pid" 2>/dev/null || true
    fi
    wait "$pid" 2>/dev/null || true
  done

  exit "$codigo_saida"
}

trap encerrar_processos EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

esperar_porta() {
  local porta="$1"
  local nome="$2"
  local limite=$((SECONDS + 180))

  until porta_esta_aberta "$porta"; do
    verificar_processos
    ((SECONDS < limite)) || falhar "$nome não ficou disponível na porta $porta."
    sleep 0.25
  done
}

esperar_http() {
  local url="$1"
  local nome="$2"
  local limite=$((SECONDS + 90))

  until curl --silent --fail --max-time 2 "$url" >/dev/null 2>&1; do
    verificar_processos
    ((SECONDS < limite)) || falhar "$nome não respondeu em $url."
    sleep 0.25
  done
}

abrir_url() {
  local url="$1"
  ((ABRIR_NAVEGADOR == 1)) || return 0

  if command -v xdg-open >/dev/null 2>&1; then
    (xdg-open "$url" >/dev/null 2>&1 || informar "Abra manualmente no navegador: $url") &
  elif command -v gio >/dev/null 2>&1; then
    (gio open "$url" >/dev/null 2>&1 || informar "Abra manualmente no navegador: $url") &
  else
    informar "Abra manualmente no navegador: $url"
  fi
}

informar "Modo selecionado: $MODO_APLICACAO."

if [[ "$MODO_APLICACAO" == "EMULADORES" ]]; then
  iniciar_processo "os emuladores Firebase" "$RAIZ_DO_FRONT/scripts/iniciar-emuladores-firebase.sh"
  esperar_porta 9099 "Firebase Authentication Emulator"
  esperar_porta 8080 "Cloud Firestore Emulator"
  esperar_http "$URL_EMULADORES" "Firebase Emulator UI"
  informar "Emuladores disponíveis em $URL_EMULADORES."
fi

AMBIENTE_VITE=(
  "VITE_MODO_APLICACAO=$MODO_APLICACAO"
  "VITE_USAR_EMULADORES=false"
)
if [[ "$MODO_APLICACAO" == "EMULADORES" ]]; then
  AMBIENTE_VITE=(
    "VITE_MODO_APLICACAO=EMULADORES"
    "VITE_USAR_EMULADORES=true"
    "VITE_FIREBASE_PROJECT_ID=demo-megadoor"
  )
fi

iniciar_processo \
  "o frontend Vue" \
  env "${AMBIENTE_VITE[@]}" \
  "$RAIZ_DO_FRONT/node_modules/.bin/vite" \
  --host 127.0.0.1 \
  --port "$PORTA_FRONT" \
  --strictPort

esperar_http "$URL_APLICACAO" "Frontend Vue"
informar "Aplicação disponível em $URL_APLICACAO."

abrir_url "$URL_APLICACAO"
if [[ "$MODO_APLICACAO" == "EMULADORES" ]]; then
  abrir_url "$URL_EMULADORES"
elif [[ "$MODO_APLICACAO" == "REAL" ]]; then
  informar "Firebase e FastAPI são serviços externos e não são iniciados por este script."
else
  informar "O modo DEMO funciona sem Firebase e sem FastAPI."
fi

if ((MODO_DE_VERIFICACAO == 1)); then
  informar "Verificação concluída; encerrando os serviços de teste."
  exit 0
fi

informar "Pressione Ctrl+C para encerrar."
set +e
wait -n "${PROCESSOS[@]}"
CODIGO_PROCESSO=$?
set -e

if ((CODIGO_PROCESSO == 0)); then
  falhar "Um dos serviços foi encerrado inesperadamente."
fi
exit "$CODIGO_PROCESSO"
