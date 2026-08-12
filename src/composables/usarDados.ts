import { computed, ref } from "vue";
import { doc } from "firebase/firestore";
import type { Candidato } from "@/dominio/entidades/Candidato";
import type { Material } from "@/dominio/entidades/Material";
import {
  StatusOrdemDeServico,
  TipoDocumentoFiscal,
  TipoProcessoProducao,
} from "@/dominio/enumeracoes";
import type { ModeloOpcao, ModeloOrdemNoPainel } from "@/aplicacao/modelosDeTela";
import { COLECOES } from "@/infraestrutura/firebase/colecoes";
import {
  firebaseEstaConfigurado,
  obterBancoDeDados,
} from "@/infraestrutura/firebase/configuracaoFirebase";
import {
  repositorioDeCandidatos,
  repositorioDeMateriais,
  repositorioDeOrdens,
} from "@/infraestrutura/servicosDaAplicacao";
import etiquetaMaterialDemonstrativa from "@/assets/etiqueta-material-demo.svg";

const ordens = ref<ModeloOrdemNoPainel[]>([
  {
    id: "OS-2026-001",
    candidatoId: "candidato-norte",
    materialId: "adesivo-branco",
    nomeDoCandidato: "Candidato Norte",
    partidoDoCandidato: "Partido Nacional",
    cnpjDoCandidato: "12.345.678/0001-90",
    nomeDoMaterial: "Adesivo Branco",
    caminhoImagemEtiquetaDoMaterial: etiquetaMaterialDemonstrativa,
    dimensoesDaUnidade: "15 × 15 cm",
    larguraGrade: 90,
    alturaGrade: 120,
    unidadesPorGrade: 52,
    quantidadeTotal: 20_000,
    tiragem: 3,
    status: StatusOrdemDeServico.EM_PRODUCAO,
    processos: [
      {
        tipo: TipoProcessoProducao.IMPRESSAO,
        unidadesProduzidas: 52,
        metaDeUnidades: 20_000,
        nomeArquivo: "Grade_Candidato_Norte_ADESIVO_15x15.pdf",
        extensao: ".pdf",
        tamanhoEmBytes: 2_460_000,
        modificadoEm: new Date("2026-08-11T08:20:00-03:00"),
        caminhoNoServidor:
          "ordens-de-servico/OS-2026-001/impressao/Grade_Candidato_Norte_ADESIVO_15x15.pdf",
      },
      {
        tipo: TipoProcessoProducao.PLOTAGEM,
        unidadesProduzidas: 0,
        metaDeUnidades: 20_000,
        nomeArquivo: "Plotagem_Candidato_Norte_ADESIVO_15x15.plt",
        extensao: ".plt",
        tamanhoEmBytes: 684_000,
        modificadoEm: new Date("2026-08-11T08:24:00-03:00"),
        caminhoNoServidor:
          "ordens-de-servico/OS-2026-001/plotagem/Plotagem_Candidato_Norte_ADESIVO_15x15.plt",
      },
      {
        tipo: TipoProcessoProducao.CORTE,
        unidadesProduzidas: 208,
        metaDeUnidades: 20_000,
        nomeArquivo: "Corte_Candidato_Norte_ADESIVO_15x15.plt",
        extensao: ".plt",
        tamanhoEmBytes: 512_000,
        modificadoEm: new Date("2026-08-11T08:27:00-03:00"),
        caminhoNoServidor:
          "ordens-de-servico/OS-2026-001/corte/Corte_Candidato_Norte_ADESIVO_15x15.plt",
      },
    ],
    caminhoRegistro: "ordens-de-servico/OS-2026-001/registro.txt",
    caminhoObservacao: "ordens-de-servico/OS-2026-001/observacao.txt",
    quantidadeRolosCalculada: null,
    observacaoDemonstrativa:
      "Conferir a tonalidade do primeiro lote antes de continuar a produção.",
    criadaEm: new Date("2026-08-11T08:00:00-03:00"),
  },
  {
    id: "OS-2026-002",
    candidatoId: "candidato-sul",
    materialId: "lona-front",
    nomeDoCandidato: "Candidato Sul",
    partidoDoCandidato: "Partido Regional",
    cnpjDoCandidato: "98.765.432/0001-10",
    nomeDoMaterial: "Lona Front",
    dimensoesDaUnidade: "910 × 310 cm",
    larguraGrade: 300,
    alturaGrade: 910,
    unidadesPorGrade: 1,
    quantidadeTotal: 1,
    tiragem: 1,
    status: StatusOrdemDeServico.PRONTA,
    processos: [
      {
        tipo: TipoProcessoProducao.IMPRESSAO,
        unidadesProduzidas: 0,
        metaDeUnidades: 1,
        nomeArquivo: "Lona_Candidato_Sul.pdf",
        extensao: ".pdf",
        tamanhoEmBytes: 8_940_000,
        modificadoEm: new Date("2026-08-10T10:18:00-03:00"),
        caminhoNoServidor: "ordens-de-servico/OS-2026-002/impressao/Lona_Candidato_Sul.pdf",
      },
    ],
    caminhoRegistro: "ordens-de-servico/OS-2026-002/registro.txt",
    caminhoObservacao: "ordens-de-servico/OS-2026-002/observacao.txt",
    quantidadeRolosCalculada: null,
    observacaoDemonstrativa: "",
    criadaEm: new Date("2026-08-10T10:00:00-03:00"),
  },
  {
    id: "OS-2026-003",
    candidatoId: "candidato-praia",
    materialId: "perfurado",
    nomeDoCandidato: "Candidato Praia",
    partidoDoCandidato: "Partido Municipal",
    cnpjDoCandidato: "45.678.901/0001-23",
    nomeDoMaterial: "Perfurado",
    dimensoesDaUnidade: "82 × 33 cm",
    larguraGrade: 106,
    alturaGrade: 200,
    unidadesPorGrade: 10,
    quantidadeTotal: 500,
    tiragem: 2,
    status: StatusOrdemDeServico.CONCLUIDA,
    processos: [
      {
        tipo: TipoProcessoProducao.IMPRESSAO,
        unidadesProduzidas: 500,
        metaDeUnidades: 500,
        nomeArquivo: "Praia.pdf",
        extensao: ".pdf",
        tamanhoEmBytes: 1_820_000,
        modificadoEm: new Date("2026-08-09T09:10:00-03:00"),
        caminhoNoServidor: "ordens-de-servico/OS-2026-003/impressao/Praia.pdf",
      },
      {
        tipo: TipoProcessoProducao.CORTE,
        unidadesProduzidas: 500,
        metaDeUnidades: 500,
        nomeArquivo: "Praia.plt",
        extensao: ".plt",
        tamanhoEmBytes: 420_000,
        modificadoEm: new Date("2026-08-09T09:12:00-03:00"),
        caminhoNoServidor: "ordens-de-servico/OS-2026-003/corte/Praia.plt",
      },
    ],
    caminhoRegistro: "ordens-de-servico/OS-2026-003/registro.txt",
    caminhoObservacao: "ordens-de-servico/OS-2026-003/observacao.txt",
    quantidadeRolosCalculada: 1,
    observacaoDemonstrativa: "Produção aprovada sem ressalvas.",
    criadaEm: new Date("2026-08-09T09:00:00-03:00"),
  },
]);

const candidatos = ref<ModeloOpcao[]>([
  {
    id: "candidato-norte",
    nome: "Candidato Norte",
    detalhe: "Partido Nacional • CNPJ • Ativo",
    partido: "Partido Nacional",
    cnpj: "12.345.678/0001-90",
  },
  {
    id: "candidato-sul",
    nome: "Candidato Sul",
    detalhe: "Partido Regional • CNPJ • Ativo",
    partido: "Partido Regional",
    cnpj: "98.765.432/0001-10",
  },
  {
    id: "candidato-praia",
    nome: "Candidato Praia",
    detalhe: "Partido Municipal • CNPJ • Ativo",
    partido: "Partido Municipal",
    cnpj: "45.678.901/0001-23",
  },
]);

const materiais = ref<ModeloOpcao[]>([
  {
    id: "adesivo-branco",
    nome: "Adesivo Branco",
    detalhe: "Megapaper • 106 × 5000000 cm",
    caminhoImagemEtiqueta: etiquetaMaterialDemonstrativa,
  },
  { id: "lona-front", nome: "Lona Front", detalhe: "Sansuy • 320 × 5000000 cm" },
  { id: "perfurado", nome: "Perfurado", detalhe: "Megapaper • 127 × 5000000 cm" },
]);

const candidatosEntidades = new Map<string, Candidato>();
const materiaisEntidades = new Map<string, Material>();
const carregando = ref(false);
let cancelarObservacaoDasOrdens: (() => void) | undefined;
let versaoDaObservacao = 0;

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
): Promise<ModeloOrdemNoPainel[]> {
  return Promise.all(
    ordensReais.map(async (ordem) => {
      const [candidato, material, processos] = await Promise.all([
        repositorioDeCandidatos.obterPorReferencia(ordem.referenciaCandidato),
        repositorioDeMateriais.obterPorReferencia(ordem.referenciaMaterial),
        repositorioDeOrdens.listarProcessos(ordem.id),
      ]);
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
        processos: processos.map((processo) => ({
          tipo: processo.tipo,
          unidadesProduzidas: processo.unidadesProduzidas,
          metaDeUnidades: processo.metaDeUnidades,
          nomeArquivo: processo.arquivo.nomeOriginal,
          extensao: processo.arquivo.extensao,
          tamanhoEmBytes: processo.arquivo.tamanhoEmBytes,
          modificadoEm: processo.arquivo.modificadoEm,
          modificadoEmPersistido: processo.arquivo.modificadoEm,
          caminhoNoServidor: processo.arquivo.caminhoNoServidor,
        })),
        caminhoRegistro: ordem.caminhoRegistro,
        caminhoObservacao: ordem.caminhoObservacao,
        quantidadeRolosCalculada: ordem.quantidadeRolosCalculada,
        criadaEm: ordem.criadaEm,
      } satisfies ModeloOrdemNoPainel;
    }),
  );
}

function iniciarObservacaoDasOrdens(): void {
  if (cancelarObservacaoDasOrdens) return;
  cancelarObservacaoDasOrdens = repositorioDeOrdens.observarLista(async (ordensReais) => {
    const versao = ++versaoDaObservacao;
    await atualizarStatusDeInatividade(ordensReais);
    const modelos = await converterOrdens(ordensReais);
    if (versao === versaoDaObservacao) ordens.value = modelos;
  });
}

async function carregar(): Promise<void> {
  if (!firebaseEstaConfigurado || carregando.value) return;
  carregando.value = true;
  try {
    const [candidatosReais, materiaisReais, ordensReais] = await Promise.all([
      repositorioDeCandidatos.listarAtivos(),
      repositorioDeMateriais.listarAtivos(),
      repositorioDeOrdens.listar(),
    ]);
    await atualizarStatusDeInatividade(ordensReais);
    candidatosReais.forEach((item) => candidatosEntidades.set(item.id, item));
    materiaisReais.forEach((item) => materiaisEntidades.set(item.id, item));
    candidatos.value = candidatosReais.map((item) => ({
      id: item.id,
      nome: item.nome,
      detalhe: [item.partido, item.documentoFiscal?.tipo, "Ativo"].filter(Boolean).join(" • "),
      partido: item.partido,
      cnpj:
        item.documentoFiscal?.tipo === TipoDocumentoFiscal.CNPJ
          ? item.documentoFiscal.numero
          : undefined,
    }));
    materiais.value = materiaisReais.map((item) => ({
      id: item.id,
      nome: item.nome,
      detalhe: `${item.marca} • ${item.dimensoesDoRolo.larguraEmCentimetros} × ${item.dimensoesDoRolo.comprimentoEmCentimetros} cm`,
      caminhoImagemEtiqueta: item.caminhoImagemEtiqueta,
    }));
    ordens.value = await converterOrdens(ordensReais);
    iniciarObservacaoDasOrdens();
  } finally {
    carregando.value = false;
  }
}

function referenciaCandidato(id: string) {
  return doc(obterBancoDeDados(), COLECOES.CANDIDATOS, id);
}

function referenciaMaterial(id: string) {
  return doc(obterBancoDeDados(), COLECOES.MATERIAIS, id);
}

function adicionarOrdemDemonstrativa(ordem: ModeloOrdemNoPainel): void {
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
  const novo = {
    id: `demo-${crypto.randomUUID()}`,
    nome,
    detalhe,
    caminhoImagemEtiqueta,
  };
  materiais.value.push(novo);
  return novo;
}

export function usarDados() {
  return {
    ordens: computed(() => ordens.value),
    candidatos: computed(() => candidatos.value),
    materiais: computed(() => materiais.value),
    carregando: computed(() => carregando.value),
    carregar,
    referenciaCandidato,
    referenciaMaterial,
    adicionarOrdemDemonstrativa,
    adicionarCandidatoDemonstrativo,
    adicionarMaterialDemonstrativo,
  };
}
