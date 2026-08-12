import { computed, ref } from "vue";
import { doc } from "firebase/firestore";
import { StatusOrdemDeServico, TipoDocumentoFiscal } from "@/dominio/enumeracoes";
import type { ModeloOpcao, ModeloOrdemNoPainel, ModeloProcesso } from "@/aplicacao/modelosDeTela";
import type { Candidato } from "@/dominio/entidades/Candidato";
import type { Material } from "@/dominio/entidades/Material";
import type { OrdemDeServico } from "@/dominio/entidades/OrdemDeServico";
import type { ProcessoDeProducao } from "@/dominio/entidades/ProcessoDeProducao";
import type { TipoProcessoProducao } from "@/dominio/enumeracoes";
import { observarFimDaSessao } from "@/composables/usarSessao";
import { COLECOES } from "@/infraestrutura/firebase/colecoes";
import {
  firebaseEstaConfigurado,
  obterBancoDeDados,
} from "@/infraestrutura/firebase/configuracaoFirebase";
import {
  criarCandidatosDemonstrativos,
  criarMateriaisDemonstrativos,
  criarOrdensDemonstrativas,
} from "@/infraestrutura/demonstracao/dadosDemonstrativos";
import {
  repositorioDeCandidatos,
  repositorioDeMateriais,
  repositorioDeOrdens,
} from "@/infraestrutura/servicosDaAplicacao";

export type EstadoDosDados = "INICIAL" | "CARREGANDO" | "PRONTO" | "ERRO";

const ordens = ref<ModeloOrdemNoPainel[]>(
  firebaseEstaConfigurado ? [] : criarOrdensDemonstrativas(),
);
const candidatos = ref<ModeloOpcao[]>(
  firebaseEstaConfigurado ? [] : criarCandidatosDemonstrativos(),
);
const materiais = ref<ModeloOpcao[]>(firebaseEstaConfigurado ? [] : criarMateriaisDemonstrativos());
const estado = ref<EstadoDosDados>(firebaseEstaConfigurado ? "INICIAL" : "PRONTO");
const erro = ref<Error | null>(null);
let promessaDeCarregamento: Promise<void> | null = null;
let cancelarObservacaoDasOrdens: (() => void) | undefined;
let cancelarObservacaoDosCandidatos: (() => void) | undefined;
let cancelarObservacaoDosMateriais: (() => void) | undefined;
const cancelamentosDosProcessos = new Map<string, () => void>();
const tiposDosProcessosPorOrdem = new Map<string, TipoProcessoProducao[]>();
const candidatosReaisPorId = new Map<string, Candidato>();
const materiaisReaisPorId = new Map<string, Material>();
const processosReaisPorOrdem = new Map<string, ProcessoDeProducao[]>();
let geracaoDasObservacoes = 0;
let versaoDaListaDeOrdens = 0;
let observandoSessao = false;

function comoErro(falha: unknown, mensagem: string): Error {
  return falha instanceof Error ? falha : new Error(mensagem);
}

function esvaziarDadosReais(): void {
  ordens.value = [];
  candidatos.value = [];
  materiais.value = [];
  tiposDosProcessosPorOrdem.clear();
  candidatosReaisPorId.clear();
  materiaisReaisPorId.clear();
  processosReaisPorOrdem.clear();
}

function cancelarObservacoes(): void {
  geracaoDasObservacoes += 1;
  versaoDaListaDeOrdens += 1;
  cancelarObservacaoDasOrdens?.();
  cancelarObservacaoDosCandidatos?.();
  cancelarObservacaoDosMateriais?.();
  cancelamentosDosProcessos.forEach((cancelar) => cancelar());
  cancelarObservacaoDasOrdens = undefined;
  cancelarObservacaoDosCandidatos = undefined;
  cancelarObservacaoDosMateriais = undefined;
  cancelamentosDosProcessos.clear();
}

function limparDadosDaSessao(): void {
  if (!firebaseEstaConfigurado) return;
  cancelarObservacoes();
  promessaDeCarregamento = null;
  esvaziarDadosReais();
  erro.value = null;
  estado.value = "INICIAL";
}

async function atualizarStatusDeInatividade(
  ordensReais: Awaited<ReturnType<typeof repositorioDeOrdens.listar>>,
): Promise<void> {
  await Promise.all(
    ordensReais
      .filter((ordem) => ordem.status === StatusOrdemDeServico.EM_PRODUCAO)
      .map(async (ordem) => {
        if (await repositorioDeOrdens.marcarComoParadaSeInativa(ordem.id)) {
          Object.assign(ordem, { status: StatusOrdemDeServico.PARADA });
        }
      }),
  );
}

async function converterOrdens(
  ordensReais: Awaited<ReturnType<typeof repositorioDeOrdens.listar>>,
  geracaoEsperada: number,
): Promise<ModeloOrdemNoPainel[]> {
  await Promise.all(
    ordensReais.flatMap((ordem) => {
      const carregamentos: Promise<void>[] = [];
      if (!candidatosReaisPorId.has(ordem.referenciaCandidato.id)) {
        carregamentos.push(
          repositorioDeCandidatos.obterPorReferencia(ordem.referenciaCandidato).then((item) => {
            if (item && geracaoEsperada === geracaoDasObservacoes)
              candidatosReaisPorId.set(item.id, item);
          }),
        );
      }
      if (!materiaisReaisPorId.has(ordem.referenciaMaterial.id)) {
        carregamentos.push(
          repositorioDeMateriais.obterPorReferencia(ordem.referenciaMaterial).then((item) => {
            if (item && geracaoEsperada === geracaoDasObservacoes)
              materiaisReaisPorId.set(item.id, item);
          }),
        );
      }
      if (!processosReaisPorOrdem.has(ordem.id)) {
        carregamentos.push(
          repositorioDeOrdens.listarProcessos(ordem.id).then((processos) => {
            if (geracaoEsperada === geracaoDasObservacoes)
              processosReaisPorOrdem.set(ordem.id, processos);
          }),
        );
      }
      return carregamentos;
    }),
  );

  const modelosAnteriores = new Map(ordens.value.map((item) => [item.id, item] as const));
  return ordensReais.map((ordem) => {
    const candidato = candidatosReaisPorId.get(ordem.referenciaCandidato.id);
    const material = materiaisReaisPorId.get(ordem.referenciaMaterial.id);
    const processos = ordenarProcessos(
      ordem.tiposDeProcessos,
      processosReaisPorOrdem.get(ordem.id) ?? [],
    );
    const processosAnteriores = new Map(
      (modelosAnteriores.get(ordem.id)?.processos ?? []).map((item) => [item.tipo, item] as const),
    );
    return {
      id: ordem.id,
      candidatoId: ordem.referenciaCandidato.id,
      materialId: ordem.referenciaMaterial.id,
      nomeDoCandidato: candidato?.nome ?? "Candidato indisponível",
      partidoDoCandidato: candidato?.partido,
      cnpjDoCandidato:
        candidato?.documentoFiscal?.tipo === TipoDocumentoFiscal.CNPJ
          ? candidato.documentoFiscal.numero
          : undefined,
      nomeDoMaterial: material?.nome ?? "Material indisponível",
      caminhoImagemEtiquetaDoMaterial: material?.caminhoImagemEtiqueta,
      dimensoesDaUnidade: `${ordem.dimensoesDaUnidade.larguraEmCentimetros} × ${ordem.dimensoesDaUnidade.alturaEmCentimetros} cm`,
      larguraGrade: ordem.especificacaoDeGrade.larguraEmCentimetros,
      alturaGrade: ordem.especificacaoDeGrade.alturaEmCentimetros,
      unidadesPorGrade: ordem.especificacaoDeGrade.unidadesPorGrade,
      quantidadeTotal: ordem.quantidadeTotal,
      tiragem: ordem.tiragem,
      status: ordem.status,
      processos: processos.map((processo) =>
        converterProcesso(processo, processosAnteriores.get(processo.tipo)),
      ),
      caminhoRegistro: ordem.caminhoRegistro,
      caminhoObservacao: ordem.caminhoObservacao,
      quantidadeRolosCalculada: ordem.quantidadeRolosCalculada,
      criadaEm: ordem.criadaEm,
    } satisfies ModeloOrdemNoPainel;
  });
}

function ordenarProcessos(
  ordemDosTipos: TipoProcessoProducao[],
  processos: ProcessoDeProducao[],
): ProcessoDeProducao[] {
  const posicao = new Map(ordemDosTipos.map((tipo, indice) => [tipo, indice] as const));
  return [...processos].sort((a, b) => (posicao.get(a.tipo) ?? 99) - (posicao.get(b.tipo) ?? 99));
}

function converterProcesso(
  processo: ProcessoDeProducao,
  anterior?: ModeloProcesso,
): ModeloProcesso {
  const mesmoArquivo = anterior?.caminhoNoServidor === processo.arquivo.caminhoNoServidor;
  return {
    tipo: processo.tipo,
    unidadesProduzidas: processo.unidadesProduzidas,
    metaDeUnidades: processo.metaDeUnidades,
    nomeArquivo: processo.arquivo.nomeOriginal,
    extensao: processo.arquivo.extensao,
    tamanhoEmBytes: processo.arquivo.tamanhoEmBytes,
    modificadoEm: mesmoArquivo
      ? (anterior.modificadoEm ?? processo.arquivo.modificadoEm)
      : processo.arquivo.modificadoEm,
    modificadoEmPersistido: processo.arquivo.modificadoEm,
    caminhoNoServidor: processo.arquivo.caminhoNoServidor,
  };
}

function converterCandidato(candidato: Candidato): ModeloOpcao {
  return {
    id: candidato.id,
    nome: candidato.nome,
    detalhe: [candidato.partido, candidato.documentoFiscal?.tipo, "Ativo"]
      .filter(Boolean)
      .join(" • "),
    partido: candidato.partido,
    cnpj:
      candidato.documentoFiscal?.tipo === TipoDocumentoFiscal.CNPJ
        ? candidato.documentoFiscal.numero
        : undefined,
  };
}

function converterMaterial(material: Material): ModeloOpcao {
  return {
    id: material.id,
    nome: material.nome,
    detalhe: `${material.marca} • ${material.dimensoesDoRolo.larguraEmCentimetros} × ${material.dimensoesDoRolo.comprimentoEmCentimetros} cm`,
    caminhoImagemEtiqueta: material.caminhoImagemEtiqueta,
  };
}

function atualizarCandidatos(candidatosReais: Candidato[]): void {
  candidatosReais.forEach((item) => candidatosReaisPorId.set(item.id, item));
  candidatos.value = candidatosReais.map(converterCandidato);
  const candidatosPorId = new Map(candidatosReais.map((item) => [item.id, item] as const));
  ordens.value = ordens.value.map((ordem) => {
    const candidato = candidatosPorId.get(ordem.candidatoId);
    if (!candidato) return ordem;
    return {
      ...ordem,
      nomeDoCandidato: candidato.nome,
      partidoDoCandidato: candidato.partido,
      cnpjDoCandidato:
        candidato.documentoFiscal?.tipo === TipoDocumentoFiscal.CNPJ
          ? candidato.documentoFiscal.numero
          : undefined,
    };
  });
}

function atualizarMateriais(materiaisReais: Material[]): void {
  materiaisReais.forEach((item) => materiaisReaisPorId.set(item.id, item));
  materiais.value = materiaisReais.map(converterMaterial);
  const materiaisPorId = new Map(materiaisReais.map((item) => [item.id, item] as const));
  ordens.value = ordens.value.map((ordem) => {
    const material = materiaisPorId.get(ordem.materialId);
    if (!material) return ordem;
    return {
      ...ordem,
      nomeDoMaterial: material.nome,
      caminhoImagemEtiquetaDoMaterial: material.caminhoImagemEtiqueta,
    };
  });
}

function registrarTiposDosProcessos(ordensReais: OrdemDeServico[]): void {
  const idsAtuais = new Set(ordensReais.map((ordem) => ordem.id));
  for (const id of tiposDosProcessosPorOrdem.keys()) {
    if (!idsAtuais.has(id)) {
      tiposDosProcessosPorOrdem.delete(id);
      processosReaisPorOrdem.delete(id);
    }
  }
  ordensReais.forEach((ordem) =>
    tiposDosProcessosPorOrdem.set(ordem.id, [...ordem.tiposDeProcessos]),
  );
}

function atualizarProcessos(idDaOrdem: string, processosReais: ProcessoDeProducao[]): void {
  processosReaisPorOrdem.set(idDaOrdem, processosReais);
  const ordem = ordens.value.find((item) => item.id === idDaOrdem);
  if (!ordem) return;
  const processosAnteriores = new Map(ordem.processos.map((item) => [item.tipo, item] as const));
  const processosAtualizados = ordenarProcessos(
    tiposDosProcessosPorOrdem.get(idDaOrdem) ?? [],
    processosReais,
  ).map((processo) => {
    const anterior = processosAnteriores.get(processo.tipo);
    // Metadados consultados diretamente na FastAPI podem ser mais recentes que
    // aqueles persistidos. O valor persistido continua separado para o CAS.
    return converterProcesso(processo, anterior);
  });
  ordem.processos = processosAtualizados;
}

function registrarFalha(falha: unknown, mensagem: string): Error {
  const falhaNormalizada = comoErro(falha, mensagem);
  if (firebaseEstaConfigurado) {
    cancelarObservacoes();
    esvaziarDadosReais();
  }
  erro.value = falhaNormalizada;
  estado.value = "ERRO";
  return falhaNormalizada;
}

function registrarFalhaDeObservacao(falha: unknown, mensagem: string): void {
  const falhaNormalizada = comoErro(falha, mensagem);
  cancelarObservacoes();
  esvaziarDadosReais();
  erro.value = falhaNormalizada;
  estado.value = "ERRO";
}

function sincronizarObservacoesDosProcessos(ordensReais: OrdemDeServico[]): void {
  // A OS e seus processos podem chegar em snapshots diferentes, mesmo quando
  // foram gravados na mesma transação. Manter o listener enquanto a OS ainda
  // pertence à lista evita perder o contador final caso o snapshot da OS
  // concluída chegue antes do snapshot dos processos.
  const idsAtuais = new Set(ordensReais.map((ordem) => ordem.id));
  for (const [id, cancelar] of cancelamentosDosProcessos) {
    if (idsAtuais.has(id)) continue;
    cancelar();
    cancelamentosDosProcessos.delete(id);
  }
  ordensReais.forEach((ordem) => {
    if (cancelamentosDosProcessos.has(ordem.id)) return;
    const geracao = geracaoDasObservacoes;
    const cancelar = repositorioDeOrdens.observarProcessos(
      ordem.id,
      (processosReais) => {
        if (geracao === geracaoDasObservacoes) atualizarProcessos(ordem.id, processosReais);
      },
      (falha) => {
        if (geracao !== geracaoDasObservacoes) return;
        registrarFalhaDeObservacao(
          falha,
          `A observação dos processos da OS ${ordem.id} foi interrompida.`,
        );
      },
    );
    cancelamentosDosProcessos.set(ordem.id, cancelar);
  });
}

function iniciarObservacaoDasOrdens(): void {
  if (cancelarObservacaoDasOrdens || !firebaseEstaConfigurado) return;
  const geracao = geracaoDasObservacoes;
  cancelarObservacaoDasOrdens = repositorioDeOrdens.observarLista(
    (ordensReais) => {
      if (geracao !== geracaoDasObservacoes) return;
      const versao = ++versaoDaListaDeOrdens;
      void (async () => {
        await atualizarStatusDeInatividade(ordensReais);
        const modelos = await converterOrdens(ordensReais, geracao);
        if (geracao !== geracaoDasObservacoes || versao !== versaoDaListaDeOrdens) return;
        registrarTiposDosProcessos(ordensReais);
        ordens.value = modelos;
        sincronizarObservacoesDosProcessos(ordensReais);
        erro.value = null;
        estado.value = "PRONTO";
      })().catch((falha) => {
        if (geracao === geracaoDasObservacoes && versao === versaoDaListaDeOrdens)
          registrarFalha(falha, "Não foi possível atualizar as Ordens de Serviço.");
      });
    },
    (falha) => {
      if (geracao !== geracaoDasObservacoes) return;
      registrarFalhaDeObservacao(falha, "A observação das Ordens de Serviço foi interrompida.");
    },
  );
}

function iniciarObservacoesDeCadastros(): void {
  if (!firebaseEstaConfigurado) return;
  const geracao = geracaoDasObservacoes;
  cancelarObservacaoDosCandidatos ??= repositorioDeCandidatos.observarAtivos(
    (itens) => {
      if (geracao === geracaoDasObservacoes) atualizarCandidatos(itens);
    },
    (falha) => {
      if (geracao !== geracaoDasObservacoes) return;
      registrarFalhaDeObservacao(falha, "A observação dos candidatos foi interrompida.");
    },
  );
  cancelarObservacaoDosMateriais ??= repositorioDeMateriais.observarAtivos(
    (itens) => {
      if (geracao === geracaoDasObservacoes) atualizarMateriais(itens);
    },
    (falha) => {
      if (geracao !== geracaoDasObservacoes) return;
      registrarFalhaDeObservacao(falha, "A observação dos materiais foi interrompida.");
    },
  );
}

async function executarCarregamento(): Promise<void> {
  const geracaoDoCarregamento = geracaoDasObservacoes;
  estado.value = "CARREGANDO";
  erro.value = null;
  try {
    const [candidatosReais, materiaisReais, ordensReais] = await Promise.all([
      repositorioDeCandidatos.listarAtivos(),
      repositorioDeMateriais.listarAtivos(),
      repositorioDeOrdens.listar(),
    ]);
    await atualizarStatusDeInatividade(ordensReais);
    const modelos = await converterOrdens(ordensReais, geracaoDoCarregamento);
    if (geracaoDoCarregamento !== geracaoDasObservacoes) return;
    atualizarCandidatos(candidatosReais);
    atualizarMateriais(materiaisReais);
    registrarTiposDosProcessos(ordensReais);
    ordens.value = modelos;
    estado.value = "PRONTO";
    iniciarObservacoesDeCadastros();
    iniciarObservacaoDasOrdens();
    sincronizarObservacoesDosProcessos(ordensReais);
  } catch (falha) {
    if (geracaoDoCarregamento !== geracaoDasObservacoes) return;
    throw registrarFalha(falha, "Não foi possível carregar os dados do Firestore.");
  }
}

async function carregar(): Promise<void> {
  if (!firebaseEstaConfigurado) return;
  if (promessaDeCarregamento) return promessaDeCarregamento;
  promessaDeCarregamento = executarCarregamento();
  try {
    await promessaDeCarregamento;
  } finally {
    promessaDeCarregamento = null;
  }
}

function referenciaCandidato(id: string) {
  return doc(obterBancoDeDados(), COLECOES.CANDIDATOS, id);
}

function referenciaMaterial(id: string) {
  return doc(obterBancoDeDados(), COLECOES.MATERIAIS, id);
}

function adicionarOrdemDemonstrativa(ordem: ModeloOrdemNoPainel): void {
  if (firebaseEstaConfigurado)
    throw new Error("Dados demonstrativos não podem ser adicionados fora do modo DEMO.");
  ordens.value.unshift(ordem);
}

interface DadosDoCandidatoDemonstrativo {
  nome: string;
  partido?: string;
  tipoDocumentoFiscal?: TipoDocumentoFiscal;
  numeroDocumentoFiscal?: string;
}

function adicionarCandidatoDemonstrativo(
  entrada: string | DadosDoCandidatoDemonstrativo,
): ModeloOpcao {
  if (firebaseEstaConfigurado)
    throw new Error("Dados demonstrativos não podem ser adicionados fora do modo DEMO.");
  const dados = typeof entrada === "string" ? { nome: entrada } : entrada;
  const novo: ModeloOpcao = {
    id: `demo-${crypto.randomUUID()}`,
    nome: dados.nome,
    detalhe: [dados.partido, dados.tipoDocumentoFiscal, "Ativo"].filter(Boolean).join(" • "),
    partido: dados.partido,
    cnpj:
      dados.tipoDocumentoFiscal === TipoDocumentoFiscal.CNPJ
        ? dados.numeroDocumentoFiscal
        : undefined,
  };
  candidatos.value.push(novo);
  return novo;
}

function adicionarMaterialDemonstrativo(
  nome: string,
  detalhe: string,
  caminhoImagemEtiqueta?: string,
): ModeloOpcao {
  if (firebaseEstaConfigurado)
    throw new Error("Dados demonstrativos não podem ser adicionados fora do modo DEMO.");
  const novo = { id: `demo-${crypto.randomUUID()}`, nome, detalhe, caminhoImagemEtiqueta };
  materiais.value.push(novo);
  return novo;
}

function garantirObservacaoDaSessao(): void {
  if (observandoSessao || !firebaseEstaConfigurado) return;
  observandoSessao = true;
  observarFimDaSessao(limparDadosDaSessao);
}

export function usarDados() {
  garantirObservacaoDaSessao();
  return {
    ordens: computed(() => ordens.value),
    candidatos: computed(() => candidatos.value),
    materiais: computed(() => materiais.value),
    carregando: computed(() => estado.value === "CARREGANDO"),
    carregado: computed(() => estado.value === "PRONTO"),
    estado: computed(() => estado.value),
    erro: computed(() => erro.value),
    carregar,
    limparDadosDaSessao,
    referenciaCandidato,
    referenciaMaterial,
    adicionarOrdemDemonstrativa,
    adicionarCandidatoDemonstrativo,
    adicionarMaterialDemonstrativo,
  };
}
