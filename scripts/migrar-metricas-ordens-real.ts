const PROJETO_PERMITIDO = "megadoor-os-system";
const aplicar = process.argv.includes("--aplicar");
const projeto = process.argv
  .find((argumento) => argumento.startsWith("--project="))
  ?.slice("--project=".length);
const token = process.env.FIREBASE_ACCESS_TOKEN;

if (projeto !== PROJETO_PERMITIDO) {
  throw new Error(`A migração aceita somente --project=${PROJETO_PERMITIDO}.`);
}
if (!token) throw new Error("FIREBASE_ACCESS_TOKEN não foi informado.");

interface ValorRest {
  nullValue?: null;
  integerValue?: string;
  doubleValue?: number;
  stringValue?: string;
  mapValue?: { fields?: Record<string, ValorRest> };
}

interface DocumentoRest {
  name: string;
  fields?: Record<string, ValorRest>;
  updateTime?: string;
}

const base = `https://firestore.googleapis.com/v1/projects/${projeto}/databases/(default)/documents`;

async function requisitar(url: string, init?: RequestInit): Promise<Response> {
  const resposta = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error(`Firestore respondeu ${resposta.status}: ${detalhe.slice(0, 500)}`);
  }
  return resposta;
}

async function listarOrdens(): Promise<DocumentoRest[]> {
  const documentos: DocumentoRest[] = [];
  let pageToken = "";
  do {
    const parametros = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) parametros.set("pageToken", pageToken);
    const resposta = await requisitar(`${base}/ordens-de-servico?${parametros}`);
    const corpo = (await resposta.json()) as {
      documents?: DocumentoRest[];
      nextPageToken?: string;
    };
    documentos.push(...(corpo.documents ?? []));
    pageToken = corpo.nextPageToken ?? "";
  } while (pageToken);
  return documentos;
}

function possuiMetricasLegadas(documento: DocumentoRest): boolean {
  const campos = documento.fields ?? {};
  return "metragemQuadradaCalculada" in campos || "quantidadeRolosCalculada" in campos;
}

function caminhoRelativo(documento: DocumentoRest): string {
  return documento.name.split("/documents/")[1] ?? documento.name;
}

async function removerMetricas(documento: DocumentoRest): Promise<void> {
  if (!documento.updateTime) {
    throw new Error(`${caminhoRelativo(documento)} não possui updateTime.`);
  }
  const caminho = caminhoRelativo(documento);
  const parametros = new URLSearchParams();
  parametros.append("updateMask.fieldPaths", "metragemQuadradaCalculada");
  parametros.append("updateMask.fieldPaths", "quantidadeRolosCalculada");
  parametros.set("currentDocument.updateTime", documento.updateTime);
  await requisitar(`${base}/${caminho}?${parametros}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: {} }),
  });
}

const ordens = await listarOrdens();
const selecionadas = ordens.filter(possuiMetricasLegadas);
console.log(`Projeto confirmado: ${projeto}`);
console.log(`Ordens verificadas: ${ordens.length}`);
console.log(`Ordens com métricas legadas: ${selecionadas.length}`);
selecionadas.forEach((documento) => console.log(`  - ${caminhoRelativo(documento)}`));

if (!aplicar) {
  console.log("DRY-RUN concluído. Nenhum documento foi alterado.");
  process.exit(0);
}

for (const documento of selecionadas) await removerMetricas(documento);

const restantes = (await listarOrdens()).filter(possuiMetricasLegadas);
if (restantes.length > 0) {
  throw new Error(
    `A verificação final encontrou ${restantes.length} Ordem(ns) ainda com métricas legadas.`,
  );
}
console.log(`Migração confirmada: ${selecionadas.length} Ordem(ns) atualizada(s).`);
