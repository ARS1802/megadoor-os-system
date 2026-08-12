import type { APIRequestContext } from "@playwright/test";

const PROJETO_FIREBASE = "megadoor-os-system";
const BASE_FIRESTORE =
  `https://firestore.googleapis.com/v1/projects/${PROJETO_FIREBASE}` +
  "/databases/(default)/documents";
const BASE_IDENTIDADE = "https://identitytoolkit.googleapis.com/v1";

interface ValorFirestoreRest {
  stringValue?: string;
  referenceValue?: string;
}

interface DocumentoFirestoreRest {
  name: string;
  fields?: Record<string, ValorFirestoreRest>;
}

export interface CredencialDaContaReal {
  idToken: string;
  uid: string;
}

export interface EstadoDaExecucaoReal {
  marcador: string;
  nomeDoUsuario: string;
  email: string;
  senha: string;
  nomeDoCandidato: string;
  nomeDoMaterial: string;
  nomeDoArquivoInicial: string;
  nomeDoArquivoCorrigido: string;
  idDaOrdem?: string;
  credencial?: CredencialDaContaReal;
}

interface RecursosDaExecucao {
  usuario?: DocumentoFirestoreRest;
  candidato?: DocumentoFirestoreRest;
  material?: DocumentoFirestoreRest;
  ordem?: DocumentoFirestoreRest;
  processos: DocumentoFirestoreRest[];
  reservasDoMaterial: DocumentoFirestoreRest[];
  operacoesIdempotentes: DocumentoFirestoreRest[];
}

function exigirVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`A variável ${nome} não foi informada.`);
  return valor;
}

function cabecalhoAdministrativo(): Record<string, string> {
  return { Authorization: `Bearer ${exigirVariavel("MEGADOOR_FIREBASE_ADMIN_TOKEN")}` };
}

function valorTexto(documento: DocumentoFirestoreRest, campo: string): string | undefined {
  return documento.fields?.[campo]?.stringValue;
}

function valorReferencia(documento: DocumentoFirestoreRest, campo: string): string | undefined {
  return documento.fields?.[campo]?.referenceValue;
}

function idDoDocumento(documento: DocumentoFirestoreRest): string {
  return documento.name.split("/").at(-1) ?? "";
}

function referenciaDoDocumento(documento: DocumentoFirestoreRest): string {
  return `projects/${PROJETO_FIREBASE}/databases/(default)/documents/${documento.name.split("/documents/")[1]}`;
}

function selecionarNoMaximoUm(
  documentos: DocumentoFirestoreRest[],
  descricao: string,
): DocumentoFirestoreRest | undefined {
  if (documentos.length > 1) {
    throw new Error(`A limpeza foi interrompida: mais de um documento corresponde a ${descricao}.`);
  }
  return documentos[0];
}

async function listarDocumentos(
  requisicoes: APIRequestContext,
  caminho: string,
): Promise<DocumentoFirestoreRest[]> {
  const documentos: DocumentoFirestoreRest[] = [];
  let proximaPagina = "";
  do {
    const parametros = new URLSearchParams({ pageSize: "1000" });
    if (proximaPagina) parametros.set("pageToken", proximaPagina);
    const resposta = await requisicoes.get(`${BASE_FIRESTORE}/${caminho}?${parametros}`, {
      headers: cabecalhoAdministrativo(),
    });
    if (!resposta.ok()) {
      throw new Error(`Não foi possível listar ${caminho} no Firestore (${resposta.status()}).`);
    }
    const corpo = (await resposta.json()) as {
      documents?: DocumentoFirestoreRest[];
      nextPageToken?: string;
    };
    documentos.push(...(corpo.documents ?? []));
    proximaPagina = corpo.nextPageToken ?? "";
  } while (proximaPagina);
  return documentos;
}

async function obterDocumento(
  requisicoes: APIRequestContext,
  caminho: string,
): Promise<DocumentoFirestoreRest | undefined> {
  const resposta = await requisicoes.get(`${BASE_FIRESTORE}/${caminho}`, {
    headers: cabecalhoAdministrativo(),
  });
  if (resposta.status() === 404) return undefined;
  if (!resposta.ok()) {
    throw new Error(`Não foi possível obter ${caminho} no Firestore (${resposta.status()}).`);
  }
  return (await resposta.json()) as DocumentoFirestoreRest;
}

async function autenticarPorEmailESenha(
  requisicoes: APIRequestContext,
  estado: EstadoDaExecucaoReal,
  ausenteEhErro: boolean,
): Promise<CredencialDaContaReal | undefined> {
  const chaveDaApi = exigirVariavel("VITE_FIREBASE_API_KEY");
  const resposta = await requisicoes.post(
    `${BASE_IDENTIDADE}/accounts:signInWithPassword?key=${encodeURIComponent(chaveDaApi)}`,
    {
      data: {
        email: estado.email,
        password: estado.senha,
        returnSecureToken: true,
      },
    },
  );
  if (!resposta.ok()) {
    const corpo = (await resposta.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const codigo = corpo.error?.message ?? "";
    if (
      !ausenteEhErro &&
      ["EMAIL_NOT_FOUND", "INVALID_LOGIN_CREDENTIALS", "INVALID_PASSWORD"].includes(codigo)
    ) {
      return undefined;
    }
    throw new Error(
      `Não foi possível obter a credencial da conta E2E (${codigo || resposta.status()}).`,
    );
  }
  const corpo = (await resposta.json()) as { idToken?: string; localId?: string };
  if (!corpo.idToken || !corpo.localId) {
    throw new Error("O Firebase Authentication não retornou idToken e localId para a conta E2E.");
  }
  return { idToken: corpo.idToken, uid: corpo.localId };
}

export async function capturarCredencialDaContaReal(
  requisicoes: APIRequestContext,
  estado: EstadoDaExecucaoReal,
): Promise<CredencialDaContaReal> {
  const credencial = await autenticarPorEmailESenha(requisicoes, estado, true);
  if (!credencial) throw new Error("A conta E2E recém-criada não foi encontrada.");
  estado.credencial = credencial;
  return credencial;
}

async function identificarRecursos(
  requisicoes: APIRequestContext,
  estado: EstadoDaExecucaoReal,
  uid: string,
): Promise<RecursosDaExecucao> {
  const referenciaUsuario = `projects/${PROJETO_FIREBASE}/databases/(default)/documents/usuarios/${uid}`;
  const [usuarios, candidatos, materiais, ordens, reservas, operacoes] = await Promise.all([
    listarDocumentos(requisicoes, "usuarios"),
    listarDocumentos(requisicoes, "candidatos"),
    listarDocumentos(requisicoes, "materiais"),
    listarDocumentos(requisicoes, "ordens-de-servico"),
    listarDocumentos(requisicoes, "nomes-de-materiais"),
    listarDocumentos(requisicoes, "operacoes-idempotentes"),
  ]);

  const usuario = selecionarNoMaximoUm(
    usuarios.filter(
      (item) =>
        idDoDocumento(item) === uid &&
        valorTexto(item, "email") === estado.email &&
        valorTexto(item, "nome") === estado.nomeDoUsuario,
    ),
    `o usuário ${estado.marcador}`,
  );
  const candidato = selecionarNoMaximoUm(
    candidatos.filter(
      (item) =>
        valorTexto(item, "nome") === estado.nomeDoCandidato &&
        valorReferencia(item, "referenciaUsuarioCriador") === referenciaUsuario,
    ),
    `o candidato ${estado.marcador}`,
  );
  const material = selecionarNoMaximoUm(
    materiais.filter(
      (item) =>
        valorTexto(item, "nome") === estado.nomeDoMaterial &&
        valorReferencia(item, "referenciaUsuarioCriador") === referenciaUsuario,
    ),
    `o material ${estado.marcador}`,
  );
  const referenciaCandidato = candidato ? referenciaDoDocumento(candidato) : undefined;
  const referenciaMaterial = material ? referenciaDoDocumento(material) : undefined;
  const ordemPeloId = estado.idDaOrdem
    ? await obterDocumento(requisicoes, `ordens-de-servico/${encodeURIComponent(estado.idDaOrdem)}`)
    : undefined;
  if (
    ordemPeloId &&
    (valorReferencia(ordemPeloId, "referenciaUsuarioCriador") !== referenciaUsuario ||
      !referenciaCandidato ||
      valorReferencia(ordemPeloId, "referenciaCandidato") !== referenciaCandidato ||
      !referenciaMaterial ||
      valorReferencia(ordemPeloId, "referenciaMaterial") !== referenciaMaterial)
  ) {
    throw new Error("A limpeza recusou a OS porque seus marcadores não pertencem à execução.");
  }
  const ordem =
    ordemPeloId ??
    selecionarNoMaximoUm(
      ordens.filter(
        (item) =>
          valorReferencia(item, "referenciaUsuarioCriador") === referenciaUsuario &&
          Boolean(referenciaCandidato) &&
          valorReferencia(item, "referenciaCandidato") === referenciaCandidato &&
          Boolean(referenciaMaterial) &&
          valorReferencia(item, "referenciaMaterial") === referenciaMaterial,
      ),
      `a Ordem de Serviço ${estado.marcador}`,
    );
  const referenciaOrdem = ordem ? referenciaDoDocumento(ordem) : undefined;
  const reservasDoMaterial = material
    ? reservas.filter(
        (item) => valorReferencia(item, "referenciaMaterial") === referenciaDoDocumento(material),
      )
    : [];
  const operacoesIdempotentes = referenciaOrdem
    ? operacoes.filter(
        (item) =>
          valorReferencia(item, "referenciaOrdemDeServico") === referenciaOrdem &&
          valorReferencia(item, "referenciaUsuario") === referenciaUsuario,
      )
    : [];
  const processos = ordem
    ? await listarDocumentos(
        requisicoes,
        `ordens-de-servico/${encodeURIComponent(idDoDocumento(ordem))}/processos`,
      )
    : [];

  return {
    usuario,
    candidato,
    material,
    ordem,
    processos,
    reservasDoMaterial,
    operacoesIdempotentes,
  };
}

function validarIdDeArquivo(id: string, descricao: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`A limpeza recusou um ${descricao} com caracteres inseguros.`);
  }
}

async function removerDiretorioDoServidor(
  requisicoes: APIRequestContext,
  uid: string,
  tipo: "ordens-de-servico" | "materiais",
  id: string,
): Promise<void> {
  validarIdDeArquivo(id, "identificador");
  const base = exigirVariavel("MEGADOOR_FASTAPI_TEST_URL").replace(/\/$/, "");
  const caminho = `${tipo}/${id}`;
  const resposta = await requisicoes.post(`${base}/api/delete`, {
    headers: { "X-User-Id": uid, Authorization: `Bearer ${uid}` },
    multipart: { path: caminho },
  });
  if (resposta.status() === 404) return;
  if (!resposta.ok()) {
    throw new Error(`Não foi possível remover ${caminho} da FastAPI (${resposta.status()}).`);
  }
}

async function removerDocumento(
  requisicoes: APIRequestContext,
  documento: DocumentoFirestoreRest,
): Promise<void> {
  const prefixoPermitido = `projects/${PROJETO_FIREBASE}/databases/(default)/documents/`;
  if (!documento.name.startsWith(prefixoPermitido)) {
    throw new Error("A limpeza recusou um documento fora do projeto permitido.");
  }
  const resposta = await requisicoes.delete(
    `https://firestore.googleapis.com/v1/${documento.name}`,
    { headers: cabecalhoAdministrativo() },
  );
  if (![200, 404].includes(resposta.status())) {
    throw new Error(`Não foi possível remover ${documento.name} (${resposta.status()}).`);
  }
}

async function removerContaDoAuthentication(
  requisicoes: APIRequestContext,
  idToken: string,
): Promise<void> {
  const chaveDaApi = exigirVariavel("VITE_FIREBASE_API_KEY");
  const resposta = await requisicoes.post(
    `${BASE_IDENTIDADE}/accounts:delete?key=${encodeURIComponent(chaveDaApi)}`,
    { data: { idToken } },
  );
  if (!resposta.ok()) {
    const corpo = (await resposta.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (corpo.error?.message === "USER_NOT_FOUND") return;
    throw new Error(
      `Não foi possível remover a conta E2E do Authentication (${corpo.error?.message || resposta.status()}).`,
    );
  }
}

async function confirmarAusenciaDosMarcadores(
  requisicoes: APIRequestContext,
  estado: EstadoDaExecucaoReal,
  uid: string,
  recursos: RecursosDaExecucao,
): Promise<void> {
  const [usuarios, candidatos, materiais, ordens] = await Promise.all([
    listarDocumentos(requisicoes, "usuarios"),
    listarDocumentos(requisicoes, "candidatos"),
    listarDocumentos(requisicoes, "materiais"),
    listarDocumentos(requisicoes, "ordens-de-servico"),
  ]);
  const sobras = [
    ...usuarios.filter((item) => idDoDocumento(item) === uid),
    ...candidatos.filter((item) => valorTexto(item, "nome") === estado.nomeDoCandidato),
    ...materiais.filter((item) => valorTexto(item, "nome") === estado.nomeDoMaterial),
    ...ordens.filter((item) => estado.idDaOrdem && idDoDocumento(item) === estado.idDaOrdem),
  ];
  if (sobras.length) {
    throw new Error(`A limpeza deixou ${sobras.length} documento(s) marcado(s) pela execução.`);
  }

  const documentosQueDevemEstarAusentes = [
    recursos.usuario,
    recursos.candidato,
    recursos.material,
    recursos.ordem,
    ...recursos.processos,
    ...recursos.reservasDoMaterial,
    ...recursos.operacoesIdempotentes,
  ].filter((item): item is DocumentoFirestoreRest => Boolean(item));
  for (const documento of documentosQueDevemEstarAusentes) {
    const resposta = await requisicoes.get(
      `https://firestore.googleapis.com/v1/${documento.name}`,
      { headers: cabecalhoAdministrativo() },
    );
    if (resposta.status() !== 404) {
      throw new Error(`A limpeza não confirmou a exclusão de ${documento.name}.`);
    }
  }
}

export async function limparRecursosDaExecucaoReal(
  requisicoes: APIRequestContext,
  estado: EstadoDaExecucaoReal,
): Promise<void> {
  const credencial =
    estado.credencial ?? (await autenticarPorEmailESenha(requisicoes, estado, false));
  if (!credencial) return;
  estado.credencial = credencial;

  const recursos = await identificarRecursos(requisicoes, estado, credencial.uid);
  const idDaOrdem = recursos.ordem ? idDoDocumento(recursos.ordem) : estado.idDaOrdem;
  const idDoMaterial = recursos.material ? idDoDocumento(recursos.material) : undefined;

  // A FastAPI exige que o perfil ainda exista. Portanto, os diretórios são
  // removidos antes dos documentos e da conta de autenticação.
  if (idDaOrdem) {
    await removerDiretorioDoServidor(requisicoes, credencial.uid, "ordens-de-servico", idDaOrdem);
  }
  if (idDoMaterial) {
    await removerDiretorioDoServidor(requisicoes, credencial.uid, "materiais", idDoMaterial);
  }

  for (const operacao of recursos.operacoesIdempotentes) {
    await removerDocumento(requisicoes, operacao);
  }
  for (const processo of recursos.processos) await removerDocumento(requisicoes, processo);
  if (recursos.ordem) await removerDocumento(requisicoes, recursos.ordem);
  for (const reserva of recursos.reservasDoMaterial) await removerDocumento(requisicoes, reserva);
  if (recursos.material) await removerDocumento(requisicoes, recursos.material);
  if (recursos.candidato) await removerDocumento(requisicoes, recursos.candidato);

  // Os diretórios já foram removidos, então o perfil não é mais necessário
  // para a FastAPI. Removê-lo antes da conta evita deixar um perfil órfão caso
  // a resposta da exclusão no Authentication se perca ou essa última etapa falhe.
  if (recursos.usuario) await removerDocumento(requisicoes, recursos.usuario);
  await removerContaDoAuthentication(requisicoes, credencial.idToken);
  const contaAindaExiste = await autenticarPorEmailESenha(requisicoes, estado, false);
  if (contaAindaExiste) {
    throw new Error("A limpeza não confirmou a exclusão da conta no Firebase Authentication.");
  }
  await confirmarAusenciaDosMarcadores(requisicoes, estado, credencial.uid, recursos);
  // O estado é reutilizado pelo afterEach serial. Esvaziar apenas depois de
  // todas as confirmações torna a limpeza idempotente sem perder os dados
  // necessários para recuperar uma execução parcialmente interrompida.
  estado.credencial = undefined;
  estado.idDaOrdem = undefined;
}
