import {
  CargoUsuario,
  StatusOrdemDeServico,
  StatusPresenca,
  TipoProcessoProducao,
} from "@/dominio/enumeracoes";
import type { ModeloOpcao, ModeloOrdemNoPainel } from "@/aplicacao/modelosDeTela";
import type { ModoDaAplicacao } from "@/infraestrutura/firebase/modoDaAplicacao";
import etiquetaMaterialDemonstrativa from "@/assets/etiqueta-material-demo.svg";

export interface PresencaDemonstrativa {
  id: string;
  nome: string;
  cargo: CargoUsuario;
  status: StatusPresenca;
}

export function criarPresencasDemonstrativas(modo: ModoDaAplicacao): PresencaDemonstrativa[] {
  if (modo !== "DEMO") return [];

  return [
    {
      id: "arthur",
      nome: "Arthur Ramos Souza",
      cargo: CargoUsuario.MAQUINISTA,
      status: StatusPresenca.ONLINE,
    },
    {
      id: "edson",
      nome: "Edson",
      cargo: CargoUsuario.DESIGNER,
      status: StatusPresenca.ONLINE,
    },
    {
      id: "junior",
      nome: "Júnior",
      cargo: CargoUsuario.ADMIN,
      status: StatusPresenca.OFFLINE,
    },
  ];
}

export function criarOrdensDemonstrativas(): ModeloOrdemNoPainel[] {
  return [
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
      larguraDaUnidadeEmCentimetros: 15,
      alturaDaUnidadeEmCentimetros: 15,
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
      registroMaisRecente:
        "[2026-08-11T08:42:00-03:00] | OPERACAO=demo-1 | USUARIO=Arthur | PROCESSO=IMPRESSAO | CONTADOR=GRADE | SENTIDO=ADICIONAR | UNIDADES=+52",
      caminhoObservacao: "ordens-de-servico/OS-2026-001/observacao.txt",
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
      larguraDaUnidadeEmCentimetros: 910,
      alturaDaUnidadeEmCentimetros: 310,
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
      registroMaisRecente: "",
      caminhoObservacao: "ordens-de-servico/OS-2026-002/observacao.txt",
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
      larguraDaUnidadeEmCentimetros: 82,
      alturaDaUnidadeEmCentimetros: 33,
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
      registroMaisRecente: "",
      caminhoObservacao: "ordens-de-servico/OS-2026-003/observacao.txt",
      observacaoDemonstrativa: "Produção aprovada sem ressalvas.",
      criadaEm: new Date("2026-08-09T09:00:00-03:00"),
    },
  ];
}

export function criarCandidatosDemonstrativos(): ModeloOpcao[] {
  return [
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
  ];
}

export function criarMateriaisDemonstrativos(): ModeloOpcao[] {
  return [
    {
      id: "adesivo-branco",
      nome: "Adesivo Branco",
      detalhe: "Megapaper • 106 × 5000000 cm",
      caminhoImagemEtiqueta: etiquetaMaterialDemonstrativa,
    },
    { id: "lona-front", nome: "Lona Front", detalhe: "Sansuy • 320 × 5000000 cm" },
    { id: "perfurado", nome: "Perfurado", detalhe: "Megapaper • 127 × 5000000 cm" },
  ];
}
