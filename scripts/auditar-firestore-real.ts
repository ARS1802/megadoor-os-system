import type { ZodType } from "zod";
import {
  esquemaDocumentoCandidato,
  esquemaDocumentoMaterial,
  esquemaDocumentoOperacaoIdempotente,
  esquemaDocumentoOrdemDeServico,
  esquemaDocumentoProcesso,
  esquemaDocumentoReservaDeNomeDeMaterial,
  esquemaDocumentoUsuario,
} from "../src/esquemas/documentosFirestore";

const PROJETO_PERMITIDO = "megadoor-os-system";
const aplicar = process.argv.includes("--aplicar");
const projeto = process.argv
  .find((argumento) => argumento.startsWith("--project="))
  ?.slice("--project=".length);
const token = process.env.FIREBASE_ACCESS_TOKEN;

if (projeto !== PROJETO_PERMITIDO) {
  throw new Error(`A auditoria aceita somente --project=${PROJETO_PERMITIDO}.`);
}
if (!token) throw new Error("FIREBASE_ACCESS_TOKEN não foi informado.");

interface ValorRest {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  referenceValue?: string;
  bytesValue?: string;
  geoPointValue?: { latitude: number; longitude: number };
  arrayValue?: { values?: ValorRest[] };
  mapValue?: { fields?: Record<string, ValorRest> };
}

interface DocumentoRest {
  name: string;
  fields?: Record<string, ValorRest>;
}

const base = `https://firestore.googleapis.com/v1/projects/${projeto}/databases/(default)/documents`;

async function requisitar(url: string, init?: RequestInit): Promise<Response> {
  const resposta = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error(`Firestore respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`);
  }
  return resposta;
}

async function listarDocumentos(caminho: string): Promise<DocumentoRest[]> {
  const documentos: DocumentoRest[] = [];
  let pageToken = "";
  do {
    const parametros = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) parametros.set("pageToken", pageToken);
    const resposta = await requisitar(`${base}/${caminho}?${parametros}`);
    const corpo = (await resposta.json()) as {
      documents?: DocumentoRest[];
      nextPageToken?: string;
    };
    documentos.push(...(corpo.documents ?? []));
    pageToken = corpo.nextPageToken ?? "";
  } while (pageToken);
  return documentos;
}

async function consultarGrupoDeColecao(nomeDaColecao: string): Promise<DocumentoRest[]> {
  const resposta = await requisitar(`${base}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: nomeDaColecao, allDescendants: true }],
      },
    }),
  });
  const resultados = (await resposta.json()) as Array<{ document?: DocumentoRest }>;
  return resultados.flatMap((resultado) => (resultado.document ? [resultado.document] : []));
}

function converterValor(valor: ValorRest): unknown {
  if ("nullValue" in valor) return null;
  if ("booleanValue" in valor) return valor.booleanValue;
  if ("integerValue" in valor) return Number(valor.integerValue);
  if ("doubleValue" in valor) return valor.doubleValue;
  if ("timestampValue" in valor) {
    const instante = new Date(valor.timestampValue!);
    return { toDate: () => instante };
  }
  if ("stringValue" in valor) return valor.stringValue;
  if ("referenceValue" in valor) {
    const marcador = "/documents/";
    return { path: valor.referenceValue!.split(marcador)[1] ?? valor.referenceValue };
  }
  if ("bytesValue" in valor) return valor.bytesValue;
  if ("geoPointValue" in valor) return valor.geoPointValue;
  if ("arrayValue" in valor) return (valor.arrayValue?.values ?? []).map(converterValor);
  if ("mapValue" in valor) return converterCampos(valor.mapValue?.fields ?? {});
  return undefined;
}

function converterCampos(campos: Record<string, ValorRest>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(campos).map(([chave, valor]) => [chave, converterValor(valor)]),
  );
}

interface ColecaoAuditada {
  caminho: string;
  schema: ZodType;
  documentos: number;
  invalidos: DocumentoRest[];
}

async function auditarColecao(caminho: string, schema: ZodType): Promise<ColecaoAuditada> {
  const documentos = await listarDocumentos(caminho);
  return auditarDocumentos(caminho, schema, documentos);
}

function auditarDocumentos(
  caminho: string,
  schema: ZodType,
  documentos: DocumentoRest[],
): ColecaoAuditada {
  return {
    caminho,
    schema,
    documentos: documentos.length,
    invalidos: documentos.filter(
      (documento) => !schema.safeParse(converterCampos(documento.fields ?? {})).success,
    ),
  };
}

function nomeDaOrdemPai(documento: DocumentoRest): string | null {
  const correspondencia = documento.name.match(
    /^(.*\/documents\/ordens-de-servico\/[^/]+)\/processos\/[^/]+$/,
  );
  return correspondencia?.[1] ?? null;
}

function caminhoRelativo(documento: DocumentoRest): string {
  return documento.name.split("/documents/")[1] ?? documento.name;
}

const colecoesRaiz: Array<[string, ZodType]> = [
  ["usuarios", esquemaDocumentoUsuario],
  ["candidatos", esquemaDocumentoCandidato],
  ["materiais", esquemaDocumentoMaterial],
  ["nomes-de-materiais", esquemaDocumentoReservaDeNomeDeMaterial],
  ["ordens-de-servico", esquemaDocumentoOrdemDeServico],
  ["operacoes-idempotentes", esquemaDocumentoOperacaoIdempotente],
];

const auditorias = await Promise.all(
  colecoesRaiz.map(([caminho, schema]) => auditarColecao(caminho, schema)),
);
const ordens = await listarDocumentos("ordens-de-servico");
const processos = await consultarGrupoDeColecao("processos");
auditorias.push(
  auditarDocumentos("**/processos (collection-group)", esquemaDocumentoProcesso, processos),
);

const nomesDasOrdens = new Set(ordens.map((ordem) => ordem.name));
const processosOrfaos = processos.filter((processo) => {
  const ordemPai = nomeDaOrdemPai(processo);
  return ordemPai === null || !nomesDasOrdens.has(ordemPai);
});

const paraExcluir = new Map<string, DocumentoRest>();
for (const auditoria of auditorias) {
  for (const documento of auditoria.invalidos) paraExcluir.set(documento.name, documento);
}

// A exclusão de um documento pai não remove subcoleções. Se uma OS é inválida,
// seus processos são removidos primeiro para não deixar documentos órfãos.
const nomesDasOrdensInvalidas = new Set(
  auditorias
    .find((auditoria) => auditoria.caminho === "ordens-de-servico")
    ?.invalidos.map((documento) => documento.name) ?? [],
);
for (const processo of processos) {
  const ordemPai = nomeDaOrdemPai(processo);
  if (ordemPai && nomesDasOrdensInvalidas.has(ordemPai)) {
    paraExcluir.set(processo.name, processo);
  }
}

console.log(`Projeto confirmado: ${projeto}`);
for (const auditoria of auditorias) {
  console.log(
    `${auditoria.caminho}: ${auditoria.documentos} documento(s), ${auditoria.invalidos.length} inválido(s)`,
  );
}
console.log(
  `Processos órfãos: ${processosOrfaos.length} (somente relatório; a orfandade não gera exclusão automática)`,
);
for (const processo of processosOrfaos) {
  console.log(`  - ${caminhoRelativo(processo)}`);
}
console.log(`Total selecionado para exclusão: ${paraExcluir.size}`);

if (!aplicar) {
  console.log("DRY-RUN concluído. Nenhum documento foi excluído.");
  process.exit(0);
}

const nomesOrdenados = [...paraExcluir.keys()].sort(
  (a, b) =>
    b.split("/documents/")[1]!.split("/").length - a.split("/documents/")[1]!.split("/").length,
);
for (const nome of nomesOrdenados) {
  await requisitar(`https://firestore.googleapis.com/v1/${nome}`, { method: "DELETE" });
}
console.log(`Exclusões confirmadas: ${nomesOrdenados.length}`);
