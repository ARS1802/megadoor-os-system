import type { DocumentReference } from "firebase/firestore";
import type { DimensoesDoRolo } from "@/dominio/objetosDeValor";
import { normalizarTextoParaBusca } from "@/dominio/servicos/normalizacao";

export interface PropriedadesMaterial {
  id: string;
  nome: string;
  nomeNormalizado?: string;
  marca: string;
  dimensoesDoRolo: DimensoesDoRolo;
  gramatura?: number;
  caminhoImagemEtiqueta?: string;
  rolosUtilizados?: number;
  referenciasOrdensDeServico?: DocumentReference[];
  referenciaUsuarioCriador: DocumentReference;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class Material {
  readonly id: string;
  readonly nome: string;
  readonly nomeNormalizado: string;
  readonly marca: string;
  readonly dimensoesDoRolo: DimensoesDoRolo;
  readonly gramatura?: number;
  readonly caminhoImagemEtiqueta?: string;
  readonly rolosUtilizados: number;
  readonly referenciasOrdensDeServico: DocumentReference[];
  readonly referenciaUsuarioCriador: DocumentReference;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  constructor(propriedades: PropriedadesMaterial) {
    const agora = new Date();
    Object.assign(this, {
      ...propriedades,
      nome: propriedades.nome.trim(),
      nomeNormalizado: propriedades.nomeNormalizado ?? normalizarTextoParaBusca(propriedades.nome),
      marca: propriedades.marca.trim(),
      rolosUtilizados: propriedades.rolosUtilizados ?? 0,
      referenciasOrdensDeServico: propriedades.referenciasOrdensDeServico ?? [],
      criadoEm: propriedades.criadoEm ?? agora,
      atualizadoEm: propriedades.atualizadoEm ?? agora,
    });
  }
}
