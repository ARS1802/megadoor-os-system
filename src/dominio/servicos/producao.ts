import { SentidoDoAjuste, TipoContadorProducao } from "@/dominio/enumeracoes";

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
