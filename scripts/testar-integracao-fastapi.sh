#!/usr/bin/env bash
set -euo pipefail

# Canario mutante e destrutivo para a FastAPI de testes.
# O --insecure existe somente aqui porque o servidor da rede usa certificado
# autoassinado. A aplicacao Vue nao desabilita a verificacao TLS.

FALHA=1
SUCESSO=0
SANDBOX_CRIADO=0
ARQUIVO_TEMPORARIO=""

informar() {
  printf '[canario-fastapi] %s\n' "$1"
}

falhar() {
  printf '[canario-fastapi] ERRO: %s\n' "$1" >&2
  exit "$FALHA"
}

exigir_comando() {
  command -v "$1" >/dev/null 2>&1 || falhar "O comando '$1' nao esta disponivel."
}

validar_sandbox() {
  [[ "${SANDBOX_REMOTO:-}" =~ ^integracao-cliente/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]
}

campo_json() {
  node - "$1" "$2" <<'NODE'
const fs = require('node:fs');

const documento = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const caminho = process.argv[3].split('.');
let valor = documento;

for (const parte of caminho) {
  if (valor === null || typeof valor !== 'object' || !(parte in valor)) {
    process.exit(2);
  }
  valor = valor[parte];
}

if (typeof valor === 'object') {
  process.stdout.write(JSON.stringify(valor));
} else {
  process.stdout.write(String(valor));
}
NODE
}

validar_campo_json() {
  local arquivo_json="$1"
  local campo="$2"
  local esperado="$3"
  local recebido

  recebido="$(campo_json "$arquivo_json" "$campo")" || \
    falhar "A resposta nao possui o campo JSON '$campo'."
  [[ "$recebido" == "$esperado" ]] || \
    falhar "Campo '$campo' inesperado: esperado '$esperado', recebido '$recebido'."
}

requisitar() {
  local arquivo_resposta="$1"
  local status_esperado="$2"
  shift 2

  local status_http
  status_http="$(curl \
    --silent \
    --show-error \
    --insecure \
    --connect-timeout 10 \
    --max-time 120 \
    --output "$arquivo_resposta" \
    --write-out '%{http_code}' \
    "$@")" || falhar "Falha de transporte ao acessar a FastAPI."

  [[ "$status_http" == "$status_esperado" ]] || {
    printf '[canario-fastapi] Resposta recebida: ' >&2
    tr '\n' ' ' <"$arquivo_resposta" >&2 || true
    printf '\n' >&2
    falhar "HTTP $status_http recebido; era esperado HTTP $status_esperado."
  }
}

cabecalhos_de_usuario() {
  CABECALHOS_DE_USUARIO=(
    --header "X-User-Id: $MEGADOOR_FASTAPI_TEST_USER_ID"
    --header "Authorization: Bearer $MEGADOOR_FASTAPI_TEST_USER_ID"
  )
}

excluir_sandbox_remoto() {
  validar_sandbox || {
    printf '[canario-fastapi] BLOQUEADO: alvo de exclusao invalido: %s\n' \
      "${SANDBOX_REMOTO:-<ausente>}" >&2
    return "$FALHA"
  }

  local resposta_exclusao="$ARQUIVO_TEMPORARIO/resposta-exclusao.json"
  local status_http
  status_http="$(curl \
    --silent \
    --show-error \
    --insecure \
    --connect-timeout 10 \
    --max-time 120 \
    --output "$resposta_exclusao" \
    --write-out '%{http_code}' \
    "${CABECALHOS_DE_USUARIO[@]}" \
    --form-string "path=$SANDBOX_REMOTO" \
    "$URL_BASE/api/delete")" || return "$FALHA"

  if [[ "$status_http" == "404" ]]; then
    # Depois de uma resposta ambígua de /api/folders, 404 confirma que o
    # sandbox não chegou a existir (ou já foi removido).
    return "$SUCESSO"
  fi

  [[ "$status_http" == "200" ]] || {
    printf '[canario-fastapi] Nao foi possivel limpar o sandbox (HTTP %s).\n' \
      "$status_http" >&2
    return "$FALHA"
  }

  validar_campo_json "$resposta_exclusao" status ok
  validar_campo_json "$resposta_exclusao" operation delete
  validar_campo_json "$resposta_exclusao" path "$SANDBOX_REMOTO"
  return "$SUCESSO"
}

finalizar() {
  local codigo_saida=$?
  set +e

  if [[ "$SANDBOX_CRIADO" -eq 1 ]]; then
    informar "Tentando limpar o sandbox remoto apos interrupcao ou falha."
    if excluir_sandbox_remoto; then
      SANDBOX_CRIADO=0
    else
      printf '[canario-fastapi] ATENCAO: limpeza remota pendente em %s\n' \
        "$SANDBOX_REMOTO" >&2
      codigo_saida=$FALHA
    fi
  fi

  if [[ -n "$ARQUIVO_TEMPORARIO" && -d "$ARQUIVO_TEMPORARIO" ]]; then
    rm -rf -- "$ARQUIVO_TEMPORARIO"
  fi

  exit "$codigo_saida"
}

trap finalizar EXIT

exigir_comando curl
exigir_comando node
exigir_comando sha256sum
exigir_comando cmp
exigir_comando grep
exigir_comando mktemp

: "${MEGADOOR_FASTAPI_TEST_URL:?Defina MEGADOOR_FASTAPI_TEST_URL.}"
: "${MEGADOOR_FASTAPI_TEST_USER_ID:?Defina MEGADOOR_FASTAPI_TEST_USER_ID.}"
: "${MEGADOOR_FASTAPI_TEST_MUTANTE:?Defina MEGADOOR_FASTAPI_TEST_MUTANTE=SIM.}"

[[ "$MEGADOOR_FASTAPI_TEST_MUTANTE" == "SIM" ]] || \
  falhar "O canario altera dados. Confirme com MEGADOOR_FASTAPI_TEST_MUTANTE=SIM."

[[ "$MEGADOOR_FASTAPI_TEST_USER_ID" != *'/'* && \
  "$MEGADOOR_FASTAPI_TEST_USER_ID" != *'\\'* && \
  "$MEGADOOR_FASTAPI_TEST_USER_ID" != *$'\n'* && \
  "$MEGADOOR_FASTAPI_TEST_USER_ID" != *$'\r'* ]] || \
  falhar "MEGADOOR_FASTAPI_TEST_USER_ID possui caracteres invalidos."

URL_BASE="$(node - "$MEGADOOR_FASTAPI_TEST_URL" <<'NODE'
const url = new URL(process.argv[2]);
if (
  url.protocol !== 'https:' ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  (url.pathname !== '/' && url.pathname !== '')
) {
  process.exit(2);
}
process.stdout.write(url.origin);
NODE
)" || falhar "MEGADOOR_FASTAPI_TEST_URL deve ser uma origem HTTPS sem credenciais ou caminho."

UUID_EXECUCAO="$(node -e "process.stdout.write(require('node:crypto').randomUUID())")"
SANDBOX_REMOTO="integracao-cliente/$UUID_EXECUCAO"
validar_sandbox || falhar "Nao foi possivel gerar um sandbox remoto seguro."

ARQUIVO_TEMPORARIO="$(mktemp -d -t megadoor-fastapi-canario.XXXXXXXXXX)"
cabecalhos_de_usuario

RESPOSTA_HEALTH="$ARQUIVO_TEMPORARIO/health.json"
RESPOSTA_OPENAPI="$ARQUIVO_TEMPORARIO/openapi.json"
RESPOSTA_PASTA="$ARQUIVO_TEMPORARIO/pasta.json"
RESPOSTA_UPLOAD="$ARQUIVO_TEMPORARIO/upload.json"
RESPOSTA_LISTA="$ARQUIVO_TEMPORARIO/lista.json"
RESPOSTA_CHECKSUM_INVALIDO="$ARQUIVO_TEMPORARIO/checksum-invalido.json"
RESPOSTA_APPEND="$ARQUIVO_TEMPORARIO/append.json"
ARQUIVO_ORIGINAL="$ARQUIVO_TEMPORARIO/arquivo-canario.txt"
ARQUIVO_SUBSTITUTO="$ARQUIVO_TEMPORARIO/arquivo-substituto.txt"
DOWNLOAD_INICIAL="$ARQUIVO_TEMPORARIO/download-inicial.txt"
DOWNLOAD_APOS_FALHA="$ARQUIVO_TEMPORARIO/download-apos-falha.txt"
REGISTRO_BAIXADO="$ARQUIVO_TEMPORARIO/registro.txt"
NOME_ARQUIVO="arquivo-canario.txt"
CAMINHO_ARQUIVO="$SANDBOX_REMOTO/$NOME_ARQUIVO"
CAMINHO_REGISTRO="$SANDBOX_REMOTO/registro.txt"

informar "Validando health e contrato OpenAPI."
requisitar "$RESPOSTA_HEALTH" 200 "$URL_BASE/health"
validar_campo_json "$RESPOSTA_HEALTH" status ok

requisitar "$RESPOSTA_OPENAPI" 200 "$URL_BASE/openapi.json"
node - "$RESPOSTA_OPENAPI" <<'NODE' || falhar "O OpenAPI nao contem o contrato esperado."
const fs = require('node:fs');
const documento = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const caminhosObrigatorios = [
  '/health',
  '/api/folders',
  '/api/upload',
  '/api/list',
  '/api/download',
  '/api/append',
  '/api/delete',
];

for (const caminho of caminhosObrigatorios) {
  if (!documento.paths?.[caminho]) process.exit(2);
}

function resolverReferencia(referencia) {
  if (typeof referencia !== 'string' || !referencia.startsWith('#/')) return null;
  return referencia
    .slice(2)
    .split('/')
    .reduce((valor, parte) => valor?.[parte], documento);
}

const operacaoUpload = documento.paths['/api/upload']?.post;
const schemaFormulario = operacaoUpload?.requestBody?.content?.['multipart/form-data']?.schema;
const formularioUpload = schemaFormulario?.$ref
  ? resolverReferencia(schemaFormulario.$ref)
  : schemaFormulario;
const schemaResposta = operacaoUpload?.responses?.['200']?.content?.['application/json']?.schema;
const respostaUpload = schemaResposta?.$ref
  ? resolverReferencia(schemaResposta.$ref)
  : schemaResposta;

if (!formularioUpload?.properties?.checksum_sha256 || !respostaUpload?.properties?.sha256) {
  process.exit(3);
}
NODE

informar "Criando sandbox remoto isolado: $SANDBOX_REMOTO"
# O resultado de uma requisição pode ser ambíguo se a resposta se perder.
# Marcar antes garante que o trap tente a exclusão do UUID seguro mesmo assim.
SANDBOX_CRIADO=1
requisitar \
  "$RESPOSTA_PASTA" \
  200 \
  "${CABECALHOS_DE_USUARIO[@]}" \
  --form-string "path=$SANDBOX_REMOTO" \
  "$URL_BASE/api/folders"
validar_campo_json "$RESPOSTA_PASTA" status ok
validar_campo_json "$RESPOSTA_PASTA" path "$SANDBOX_REMOTO"

printf 'Canario Megadoor OS\nExecucao: %s\n' "$UUID_EXECUCAO" >"$ARQUIVO_ORIGINAL"
printf 'Este conteudo nao pode substituir o anterior.\n' >"$ARQUIVO_SUBSTITUTO"
HASH_ORIGINAL="$(sha256sum "$ARQUIVO_ORIGINAL" | cut -d ' ' -f 1)"
TAMANHO_ORIGINAL="$(wc -c <"$ARQUIVO_ORIGINAL" | tr -d '[:space:]')"

informar "Enviando arquivo pequeno com SHA-256."
requisitar \
  "$RESPOSTA_UPLOAD" \
  200 \
  "${CABECALHOS_DE_USUARIO[@]}" \
  --form "file=@$ARQUIVO_ORIGINAL;filename=$NOME_ARQUIVO;type=text/plain" \
  --form-string "path=$SANDBOX_REMOTO" \
  --form-string "checksum_sha256=$HASH_ORIGINAL" \
  "$URL_BASE/api/upload"
validar_campo_json "$RESPOSTA_UPLOAD" status ok
validar_campo_json "$RESPOSTA_UPLOAD" saved_as "$CAMINHO_ARQUIVO"
validar_campo_json "$RESPOSTA_UPLOAD" filename "$NOME_ARQUIVO"
validar_campo_json "$RESPOSTA_UPLOAD" size "$TAMANHO_ORIGINAL"
validar_campo_json "$RESPOSTA_UPLOAD" sha256 "$HASH_ORIGINAL"

informar "Validando listagem e download do arquivo enviado."
requisitar \
  "$RESPOSTA_LISTA" \
  200 \
  "${CABECALHOS_DE_USUARIO[@]}" \
  --form-string "path=$SANDBOX_REMOTO" \
  "$URL_BASE/api/list"
node - "$RESPOSTA_LISTA" "$NOME_ARQUIVO" "$CAMINHO_ARQUIVO" "$TAMANHO_ORIGINAL" <<'NODE' || \
  falhar "A listagem nao corresponde ao arquivo enviado."
const fs = require('node:fs');
const documento = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const item = documento.items?.find((candidato) => candidato.name === process.argv[3]);
if (
  !item ||
  item.path !== process.argv[4] ||
  item.type !== 'file' ||
  item.size !== Number(process.argv[5])
) {
  process.exit(2);
}
NODE

requisitar \
  "$DOWNLOAD_INICIAL" \
  200 \
  "${CABECALHOS_DE_USUARIO[@]}" \
  --form-string "path=$CAMINHO_ARQUIVO" \
  "$URL_BASE/api/download"
[[ "$(sha256sum "$DOWNLOAD_INICIAL" | cut -d ' ' -f 1)" == "$HASH_ORIGINAL" ]] || \
  falhar "O SHA-256 do download difere do upload."
cmp --silent "$ARQUIVO_ORIGINAL" "$DOWNLOAD_INICIAL" || \
  falhar "Os bytes baixados diferem dos bytes enviados."

informar "Confirmando que checksum incorreto nao substitui o arquivo anterior."
requisitar \
  "$RESPOSTA_CHECKSUM_INVALIDO" \
  422 \
  "${CABECALHOS_DE_USUARIO[@]}" \
  --form "file=@$ARQUIVO_SUBSTITUTO;filename=$NOME_ARQUIVO;type=text/plain" \
  --form-string "path=$SANDBOX_REMOTO" \
  --form-string "checksum_sha256=$(printf '0%.0s' {1..64})" \
  "$URL_BASE/api/upload"
node - "$RESPOSTA_CHECKSUM_INVALIDO" <<'NODE' || \
  falhar "O HTTP 422 nao foi causado pela divergencia do checksum SHA-256."
const fs = require('node:fs');
const documento = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (
  typeof documento.detail !== 'string' ||
  !documento.detail.toLocaleLowerCase('pt-BR').includes('checksum') ||
  !documento.detail.toLocaleLowerCase('pt-BR').includes('nao confere')
) {
  process.exit(2);
}
NODE

requisitar \
  "$DOWNLOAD_APOS_FALHA" \
  200 \
  "${CABECALHOS_DE_USUARIO[@]}" \
  --form-string "path=$CAMINHO_ARQUIVO" \
  "$URL_BASE/api/download"
[[ "$(sha256sum "$DOWNLOAD_APOS_FALHA" | cut -d ' ' -f 1)" == "$HASH_ORIGINAL" ]] || \
  falhar "O arquivo anterior foi alterado apos o checksum invalido."
cmp --silent "$ARQUIVO_ORIGINAL" "$DOWNLOAD_APOS_FALHA" || \
  falhar "O overwrite invalido modificou os bytes anteriores."

CONTEUDO_REGISTRO="EVENTO=CANARIO_INTEGRACAO;ID_DA_OPERACAO=$UUID_EXECUCAO"
informar "Validando append no registro descartavel."
requisitar \
  "$RESPOSTA_APPEND" \
  200 \
  "${CABECALHOS_DE_USUARIO[@]}" \
  --form-string "path=$CAMINHO_REGISTRO" \
  --form-string "content=$CONTEUDO_REGISTRO" \
  "$URL_BASE/api/append"
validar_campo_json "$RESPOSTA_APPEND" status ok
validar_campo_json "$RESPOSTA_APPEND" operation append
validar_campo_json "$RESPOSTA_APPEND" path "$CAMINHO_REGISTRO"

requisitar \
  "$REGISTRO_BAIXADO" \
  200 \
  "${CABECALHOS_DE_USUARIO[@]}" \
  --form-string "path=$CAMINHO_REGISTRO" \
  "$URL_BASE/api/download"
grep --fixed-strings --line-regexp --quiet "$CONTEUDO_REGISTRO" "$REGISTRO_BAIXADO" || \
  falhar "O conteudo acrescentado nao foi encontrado no registro."

informar "Removendo exclusivamente o sandbox remoto validado."
excluir_sandbox_remoto || falhar "A limpeza final do sandbox falhou."
SANDBOX_CRIADO=0

informar "Canario concluido: upload, integridade, atomicidade, append e limpeza aprovados."
exit "$SUCESSO"
