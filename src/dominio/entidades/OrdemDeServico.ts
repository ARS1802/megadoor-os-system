import type { DocumentReference } from "firebase/firestore";
import { StatusOrdemDeServico, TipoProcessoProducao } from "@/dominio/enumeracoes";
import { ErroDeDominio } from "@/dominio/erros/ErroDeDominio";
import type {
  DadosDeConclusao,
  DimensoesDaUnidade,
  EspecificacaoDeGrade,
} from "@/dominio/objetosDeValor";
import type { Material } from "@/dominio/entidades/Material";

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
  caminhoObservacao: string;
  dadosDeConclusao?: DadosDeConclusao;
  metragemQuadradaCalculada?: number | null;
  quantidadeRolosCalculada?: number | null;
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
  readonly caminhoObservacao: string;
  readonly dadosDeConclusao?: DadosDeConclusao;
  readonly metragemQuadradaCalculada: number | null;
  readonly quantidadeRolosCalculada: number | null;
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
      metragemQuadradaCalculada: propriedades.metragemQuadradaCalculada ?? null,
      quantidadeRolosCalculada: propriedades.quantidadeRolosCalculada ?? null,
      criadaEm: propriedades.criadaEm ?? agora,
      atualizadaEm: propriedades.atualizadaEm ?? agora,
    });
  }

  calcularQuantidadeDeGrades(): number {
    return Math.ceil(this.quantidadeTotal / this.especificacaoDeGrade.unidadesPorGrade);
  }

  calcularMetragemQuadrada(): number {
    const larguraEmMetros = this.especificacaoDeGrade.larguraEmCentimetros / 100;
    const alturaEmMetros = this.especificacaoDeGrade.alturaEmCentimetros / 100;
    return larguraEmMetros * alturaEmMetros * this.calcularQuantidadeDeGrades();
  }

  calcularQuantidadeDeRolos(material: Material): number {
    if (
      this.especificacaoDeGrade.larguraEmCentimetros > material.dimensoesDoRolo.larguraEmCentimetros
    ) {
      throw new ErroDeDominio("A largura da grade é maior que a largura do rolo.");
    }
    const comprimentoUtilizado =
      this.especificacaoDeGrade.alturaEmCentimetros * this.calcularQuantidadeDeGrades();
    return Math.ceil(comprimentoUtilizado / material.dimensoesDoRolo.comprimentoEmCentimetros);
  }

  verificarSeAceitaProducao(): void {
    if (this.status === StatusOrdemDeServico.CONCLUIDA) {
      throw new ErroDeDominio("Uma OS concluída não aceita novos ajustes de produção.");
    }
  }
}
