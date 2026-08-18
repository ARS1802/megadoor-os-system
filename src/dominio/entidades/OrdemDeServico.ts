import type { DocumentReference } from "firebase/firestore";
import { StatusOrdemDeServico, TipoProcessoProducao } from "@/dominio/enumeracoes";
import { ErroDeDominio } from "@/dominio/erros/ErroDeDominio";
import type {
  DadosDeConclusao,
  DimensoesDaUnidade,
  EspecificacaoDeGrade,
} from "@/dominio/objetosDeValor";

export interface PropriedadesOrdemDeServico {
  id: string;
  referenciaCandidato: DocumentReference;
  referenciaMaterial: DocumentReference;
  referenciaUsuarioCriador: DocumentReference;
  tiragem: number;
  quantidadeTotal: number;
  dimensoesDaUnidade: DimensoesDaUnidade;
  especificacaoDeGrade: EspecificacaoDeGrade;
  tiposDeProcessos: TipoProcessoProducao[];
  status?: StatusOrdemDeServico;
  ultimaAtividadeEm?: Date | null;
  caminhoRegistro: string;
  registroMaisRecente?: string;
  caminhoObservacao: string;
  dadosDeConclusao?: DadosDeConclusao;
  criadaEm?: Date;
  atualizadaEm?: Date;
}

export class OrdemDeServico {
  readonly id: string;
  readonly referenciaCandidato: DocumentReference;
  readonly referenciaMaterial: DocumentReference;
  readonly referenciaUsuarioCriador: DocumentReference;
  readonly tiragem: number;
  readonly quantidadeTotal: number;
  readonly dimensoesDaUnidade: DimensoesDaUnidade;
  readonly especificacaoDeGrade: EspecificacaoDeGrade;
  readonly tiposDeProcessos: TipoProcessoProducao[];
  readonly status: StatusOrdemDeServico;
  readonly ultimaAtividadeEm: Date | null;
  readonly caminhoRegistro: string;
  readonly registroMaisRecente: string;
  readonly caminhoObservacao: string;
  readonly dadosDeConclusao?: DadosDeConclusao;
  readonly criadaEm: Date;
  readonly atualizadaEm: Date;

  constructor(propriedades: PropriedadesOrdemDeServico) {
    if (!Number.isInteger(propriedades.tiragem) || propriedades.tiragem <= 0) {
      throw new ErroDeDominio("A tiragem deve ser um inteiro positivo.");
    }
    if (!Number.isInteger(propriedades.quantidadeTotal) || propriedades.quantidadeTotal <= 0) {
      throw new ErroDeDominio("A quantidade total deve ser um inteiro positivo.");
    }
    const tipos = [...new Set(propriedades.tiposDeProcessos)];
    if (
      tipos.length < 1 ||
      tipos.length > 3 ||
      tipos.length !== propriedades.tiposDeProcessos.length
    ) {
      throw new ErroDeDominio("A OS deve possuir de um a três processos diferentes.");
    }
    const agora = new Date();
    Object.assign(this, {
      ...propriedades,
      tiposDeProcessos: tipos,
      status: propriedades.status ?? StatusOrdemDeServico.PRONTA,
      ultimaAtividadeEm: propriedades.ultimaAtividadeEm ?? null,
      registroMaisRecente: propriedades.registroMaisRecente ?? "",
      criadaEm: propriedades.criadaEm ?? agora,
      atualizadaEm: propriedades.atualizadaEm ?? agora,
    });
  }

  verificarSeAceitaProducao(): void {
    if (this.status === StatusOrdemDeServico.CONCLUIDA) {
      throw new ErroDeDominio("Uma OS concluída não aceita novos ajustes de produção.");
    }
  }
}
