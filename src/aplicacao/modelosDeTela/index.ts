import type { StatusOrdemDeServico, TipoProcessoProducao } from "@/dominio/enumeracoes";

export interface ModeloProcesso {
  tipo: TipoProcessoProducao;
  unidadesProduzidas: number;
  metaDeUnidades: number;
  nomeArquivo: string;
  extensao: string;
  tamanhoEmBytes: number;
  caminhoNoServidor: string;
  modificadoEm?: Date;
  /** Versão persistida usada no controle de concorrência; a consulta ao servidor não a altera. */
  modificadoEmPersistido?: Date;
}

export interface ModeloOrdemNoPainel {
  id: string;
  candidatoId: string;
  materialId: string;
  nomeDoCandidato: string;
  partidoDoCandidato?: string;
  cnpjDoCandidato?: string;
  nomeDoMaterial: string;
  caminhoImagemEtiquetaDoMaterial?: string;
  dimensoesDaUnidade: string;
  larguraGrade: number;
  alturaGrade: number;
  unidadesPorGrade: number;
  quantidadeTotal: number;
  tiragem: number;
  status: StatusOrdemDeServico;
  processos: ModeloProcesso[];
  caminhoRegistro: string;
  caminhoObservacao: string;
  quantidadeRolosCalculada?: number | null;
  observacaoDemonstrativa?: string;
  criadaEm: Date;
}

export interface ModeloOpcao {
  id: string;
  nome: string;
  detalhe: string;
  partido?: string;
  cnpj?: string;
  caminhoImagemEtiqueta?: string;
}
