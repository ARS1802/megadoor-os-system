import type { DocumentReference, Timestamp } from "firebase/firestore";
import type {
  CargoUsuario,
  StatusOrdemDeServico,
  StatusSincronizacaoRegistro,
  TipoDocumentoFiscal,
  TipoProcessoProducao,
} from "@/dominio/enumeracoes";

export interface DocumentoUsuario {
  nome: string;
  email: string;
  cargo: CargoUsuario;
  ativo: boolean;
  referenciasOrdensParticipadas: DocumentReference[];
  criadoEm: Timestamp;
  atualizadoEm: Timestamp;
}

export interface DocumentoCandidato {
  nome: string;
  nomeNormalizado: string;
  partido?: string;
  documentoFiscal?: { tipo: TipoDocumentoFiscal; numero: string };
  observacoes?: string;
  ativo: boolean;
  referenciaUsuarioCriador: DocumentReference;
  criadoEm: Timestamp;
  atualizadoEm: Timestamp;
}

export interface DocumentoMaterial {
  nome: string;
  nomeNormalizado: string;
  marca: string;
  dimensoesDoRolo: {
    larguraEmCentimetros: number;
    comprimentoEmCentimetros: number;
  };
  gramatura?: number;
  caminhoImagemEtiqueta?: string;
  rolosUtilizados: number;
  referenciasOrdensDeServico: DocumentReference[];
  referenciaUsuarioCriador: DocumentReference;
  criadoEm: Timestamp;
  atualizadoEm: Timestamp;
}

export interface DocumentoOrdemDeServico {
  referenciaCandidato: DocumentReference;
  referenciaMaterial: DocumentReference;
  referenciaUsuarioCriador: DocumentReference;
  tiragem: number;
  quantidadeTotal: number;
  dimensoesDaUnidade: { larguraEmCentimetros: number; alturaEmCentimetros: number };
  especificacaoDeGrade: {
    larguraEmCentimetros: number;
    alturaEmCentimetros: number;
    unidadesPorGrade: number;
  };
  tiposDeProcessos: TipoProcessoProducao[];
  status: StatusOrdemDeServico;
  ultimaAtividadeEm: Timestamp | null;
  caminhoRegistro: string;
  caminhoObservacao: string;
  dadosDeConclusao?: {
    concluidaEm: Timestamp;
    referenciaUsuarioResponsavel: DocumentReference;
    foiForcada: boolean;
    justificativa?: string;
  };
  metragemQuadradaCalculada: number | null;
  quantidadeRolosCalculada: number | null;
  criadaEm: Timestamp;
  atualizadaEm: Timestamp;
}

export interface DocumentoProcessoDeProducao {
  tipo: TipoProcessoProducao;
  arquivo: {
    nomeOriginal: string;
    extensao: string;
    tamanhoEmBytes: number;
    caminhoNoServidor: string;
    modificadoEm?: Timestamp;
  };
  unidadesProduzidas: number;
  metaDeUnidades: number;
  ultimaAtividadeEm: Timestamp | null;
  referenciaUltimoUsuario: DocumentReference | null;
  criadoEm: Timestamp;
  atualizadoEm: Timestamp;
}

export interface DocumentoOperacaoIdempotente {
  referenciaOrdemDeServico: DocumentReference;
  referenciaUsuario: DocumentReference;
  tipoProcesso: TipoProcessoProducao;
  sincronizacaoDoRegistro: StatusSincronizacaoRegistro;
  criadaEm: Timestamp;
  expiraEm: Timestamp;
}
