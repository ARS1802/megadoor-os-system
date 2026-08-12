import type { DocumentReference } from "firebase/firestore";
import { TipoProcessoProducao } from "@/dominio/enumeracoes";
import type { ArquivoDeProducao } from "@/dominio/objetosDeValor";
import { ErroDeDominio } from "@/dominio/erros/ErroDeDominio";

export interface PropriedadesProcessoDeProducao {
  tipo: TipoProcessoProducao;
  arquivo: ArquivoDeProducao;
  unidadesProduzidas?: number;
  metaDeUnidades: number;
  ultimaAtividadeEm?: Date | null;
  referenciaUltimoUsuario?: DocumentReference | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class ProcessoDeProducao {
  readonly tipo: TipoProcessoProducao;
  readonly arquivo: ArquivoDeProducao;
  readonly unidadesProduzidas: number;
  readonly metaDeUnidades: number;
  readonly ultimaAtividadeEm: Date | null;
  readonly referenciaUltimoUsuario: DocumentReference | null;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  constructor(propriedades: PropriedadesProcessoDeProducao) {
    if (!Number.isInteger(propriedades.metaDeUnidades) || propriedades.metaDeUnidades <= 0) {
      throw new ErroDeDominio("A meta do processo deve ser um inteiro positivo.");
    }
    if ((propriedades.unidadesProduzidas ?? 0) < 0) {
      throw new ErroDeDominio("As unidades produzidas não podem ser negativas.");
    }
    if (
      propriedades.arquivo.modificadoEm &&
      Number.isNaN(propriedades.arquivo.modificadoEm.getTime())
    ) {
      throw new ErroDeDominio("A data de modificação do arquivo é inválida.");
    }
    const agora = new Date();
    Object.assign(this, {
      ...propriedades,
      unidadesProduzidas: propriedades.unidadesProduzidas ?? 0,
      ultimaAtividadeEm: propriedades.ultimaAtividadeEm ?? null,
      referenciaUltimoUsuario: propriedades.referenciaUltimoUsuario ?? null,
      criadoEm: propriedades.criadoEm ?? agora,
      atualizadoEm: propriedades.atualizadoEm ?? agora,
    });
  }

  get progressoReal(): number {
    return (this.unidadesProduzidas / this.metaDeUnidades) * 100;
  }

  get concluido(): boolean {
    return this.unidadesProduzidas >= this.metaDeUnidades;
  }
}
