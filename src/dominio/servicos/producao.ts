import { SentidoDoAjuste, TipoContadorProducao } from "@/dominio/enumeracoes";

export interface MedidoresDaProducao {
  gradesProduzidas: number;
  gradesNecessarias: number;
  gradesFaltantes: number;
  unidadesProduzidas: number;
  quantidadeTotal: number;
  unidadesFaltantes: number;
}

function exigirDimensaoPositiva(valor: number, campo: string): void {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error(`${campo} deve ser maior que zero.`);
  }
}

export function calcularMetragemQuadradaProduzida(
  larguraDaUnidadeEmCentimetros: number,
  alturaDaUnidadeEmCentimetros: number,
  unidadesProduzidas: number,
): number {
  exigirDimensaoPositiva(larguraDaUnidadeEmCentimetros, "A largura da unidade");
  exigirDimensaoPositiva(alturaDaUnidadeEmCentimetros, "A altura da unidade");
  if (!Number.isSafeInteger(unidadesProduzidas) || unidadesProduzidas < 0) {
    throw new Error("As unidades produzidas devem formar um inteiro não negativo.");
  }
  return (
    (larguraDaUnidadeEmCentimetros / 100) *
    (alturaDaUnidadeEmCentimetros / 100) *
    unidadesProduzidas
  );
}

export function calcularRolosUtilizadosPorMetragem(
  metragemQuadradaProduzida: number,
  larguraDoRoloEmCentimetros: number,
  comprimentoDoRoloEmCentimetros: number,
): number {
  if (!Number.isFinite(metragemQuadradaProduzida) || metragemQuadradaProduzida < 0) {
    throw new Error("A metragem quadrada produzida deve ser um número não negativo.");
  }
  exigirDimensaoPositiva(larguraDoRoloEmCentimetros, "A largura do rolo");
  exigirDimensaoPositiva(comprimentoDoRoloEmCentimetros, "O comprimento do rolo");
  if (metragemQuadradaProduzida === 0) return 0;
  const areaDoRolo = (larguraDoRoloEmCentimetros / 100) * (comprimentoDoRoloEmCentimetros / 100);
  return Math.ceil(metragemQuadradaProduzida / areaDoRolo);
}

export function calcularMedidoresDaProducao(
  unidadesProduzidas: number,
  quantidadeTotal: number,
  unidadesPorGrade: number,
): MedidoresDaProducao {
  if (!Number.isSafeInteger(unidadesProduzidas) || unidadesProduzidas < 0) {
    throw new Error("As unidades produzidas devem formar um inteiro não negativo.");
  }
  if (!Number.isSafeInteger(quantidadeTotal) || quantidadeTotal <= 0) {
    throw new Error("A quantidade total deve ser um inteiro maior que zero.");
  }
  if (!Number.isSafeInteger(unidadesPorGrade) || unidadesPorGrade <= 0) {
    throw new Error("As unidades por grade devem formar um inteiro maior que zero.");
  }
  const gradesProduzidas = Math.floor(unidadesProduzidas / unidadesPorGrade);
  const gradesNecessarias = Math.ceil(quantidadeTotal / unidadesPorGrade);
  return {
    gradesProduzidas,
    gradesNecessarias,
    gradesFaltantes: Math.max(0, gradesNecessarias - gradesProduzidas),
    unidadesProduzidas,
    quantidadeTotal,
    unidadesFaltantes: Math.max(0, quantidadeTotal - unidadesProduzidas),
  };
}

export function calcularVariacaoEmUnidades(
  tipoContador: TipoContadorProducao,
  sentido: SentidoDoAjuste,
  unidadesPorGrade: number,
  quantidadeDoAjuste: number,
): number {
  if (!Number.isSafeInteger(quantidadeDoAjuste) || quantidadeDoAjuste <= 0) {
    throw new Error("A quantidade do ajuste deve ser um inteiro maior que zero.");
  }
  if (tipoContador === TipoContadorProducao.GRADE && quantidadeDoAjuste !== 1) {
    throw new Error("Cada ajuste de grade deve representar exatamente uma grade.");
  }
  const quantidade =
    tipoContador === TipoContadorProducao.GRADE ? unidadesPorGrade : quantidadeDoAjuste;
  if (!Number.isSafeInteger(quantidade)) {
    throw new Error("O ajuste ultrapassa o limite numérico permitido.");
  }
  return sentido === SentidoDoAjuste.ADICIONAR ? quantidade : -quantidade;
}
