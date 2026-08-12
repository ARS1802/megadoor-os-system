import type { DocumentReference } from "firebase/firestore";
import { TipoDocumentoFiscal, TipoProcessoProducao } from "@/dominio/enumeracoes";
import { ErroDeDominio } from "@/dominio/erros/ErroDeDominio";

function exigirPositivo(valor: number, campo: string): void {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new ErroDeDominio(`${campo} deve ser maior que zero.`);
  }
}

export class DimensoesDaUnidade {
  constructor(
    public readonly larguraEmCentimetros: number,
    public readonly alturaEmCentimetros: number,
  ) {
    exigirPositivo(larguraEmCentimetros, "A largura da unidade");
    exigirPositivo(alturaEmCentimetros, "A altura da unidade");
  }

  paraMapa() {
    return {
      larguraEmCentimetros: this.larguraEmCentimetros,
      alturaEmCentimetros: this.alturaEmCentimetros,
    };
  }
}

export class DimensoesDoRolo {
  constructor(
    public readonly larguraEmCentimetros: number,
    public readonly comprimentoEmCentimetros: number,
  ) {
    exigirPositivo(larguraEmCentimetros, "A largura do rolo");
    exigirPositivo(comprimentoEmCentimetros, "O comprimento do rolo");
  }

  paraMapa() {
    return {
      larguraEmCentimetros: this.larguraEmCentimetros,
      comprimentoEmCentimetros: this.comprimentoEmCentimetros,
    };
  }
}

export class EspecificacaoDeGrade {
  constructor(
    public readonly larguraEmCentimetros: number,
    public readonly alturaEmCentimetros: number,
    public readonly unidadesPorGrade: number,
  ) {
    exigirPositivo(larguraEmCentimetros, "A largura da grade");
    exigirPositivo(alturaEmCentimetros, "A altura da grade");
    if (!Number.isInteger(unidadesPorGrade) || unidadesPorGrade <= 0) {
      throw new ErroDeDominio("Unidades por grade deve ser um inteiro positivo.");
    }
  }

  paraMapa() {
    return {
      larguraEmCentimetros: this.larguraEmCentimetros,
      alturaEmCentimetros: this.alturaEmCentimetros,
      unidadesPorGrade: this.unidadesPorGrade,
    };
  }
}

export interface DocumentoFiscal {
  tipo: TipoDocumentoFiscal;
  numero: string;
}

export interface ArquivoDeProducao {
  nomeOriginal: string;
  extensao: string;
  tamanhoEmBytes: number;
  caminhoNoServidor: string;
  /** Instante real informado pelo servidor de arquivos; ausente somente em documentos legados. */
  modificadoEm?: Date;
}

export interface NovoArquivoDeProducao extends ArquivoDeProducao {
  modificadoEm: Date;
}

export interface DadosDeConclusao {
  concluidaEm: Date;
  referenciaUsuarioResponsavel: DocumentReference;
  foiForcada: boolean;
  justificativa?: string;
}

export interface ConfiguracaoServidor {
  endereco: string;
  porta: number;
}

export interface ArquivoSelecionadoDoProcesso {
  tipo: TipoProcessoProducao;
  arquivo: File;
}
