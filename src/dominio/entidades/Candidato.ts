import type { DocumentReference } from "firebase/firestore";
import type { DocumentoFiscal } from "@/dominio/objetosDeValor";
import { normalizarTextoParaBusca } from "@/dominio/servicos/normalizacao";

export interface PropriedadesCandidato {
  id: string;
  nome: string;
  nomeNormalizado?: string;
  partido?: string;
  documentoFiscal?: DocumentoFiscal;
  observacoes?: string;
  ativo?: boolean;
  referenciaUsuarioCriador: DocumentReference;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Candidato {
  readonly id: string;
  readonly nome: string;
  readonly nomeNormalizado: string;
  readonly partido?: string;
  readonly documentoFiscal?: DocumentoFiscal;
  readonly observacoes?: string;
  readonly ativo: boolean;
  readonly referenciaUsuarioCriador: DocumentReference;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  constructor(propriedades: PropriedadesCandidato) {
    const agora = new Date();
    Object.assign(this, {
      ...propriedades,
      nome: propriedades.nome.trim(),
      nomeNormalizado: propriedades.nomeNormalizado ?? normalizarTextoParaBusca(propriedades.nome),
      partido: propriedades.partido?.trim() || undefined,
      ativo: propriedades.ativo ?? true,
      criadoEm: propriedades.criadoEm ?? agora,
      atualizadoEm: propriedades.atualizadoEm ?? agora,
    });
  }
}
