export interface OrdemParaResumoDaProducao {
  candidatoId: string;
  nomeDoCandidato: string;
  larguraGrade: number;
  alturaGrade: number;
  unidadesPorGrade: number;
  quantidadeTotal: number;
  quantidadeRolosCalculada?: number | null;
}

export interface ProducaoResumidaPorCandidato {
  id: string;
  candidato: string;
  metragem: number;
  rolos: number;
}

function calcularMetragemDaOrdem(ordem: OrdemParaResumoDaProducao): number {
  const quantidadeDeGrades = Math.ceil(ordem.quantidadeTotal / ordem.unidadesPorGrade);
  const areaDeUmaGrade = (ordem.larguraGrade / 100) * (ordem.alturaGrade / 100);
  return areaDeUmaGrade * quantidadeDeGrades;
}

/**
 * Consolida as OS pelo candidato sem usar o acumulado global do Material.
 * Esse acumulado não permite identificar qual candidato consumiu cada rolo.
 */
export function resumirProducaoPorCandidato(
  ordens: OrdemParaResumoDaProducao[],
): ProducaoResumidaPorCandidato[] {
  const resumo = new Map<string, ProducaoResumidaPorCandidato>();

  for (const ordem of ordens) {
    const linha = resumo.get(ordem.candidatoId) ?? {
      id: ordem.candidatoId,
      candidato: ordem.nomeDoCandidato,
      metragem: 0,
      rolos: 0,
    };

    linha.metragem += calcularMetragemDaOrdem(ordem);
    linha.rolos += ordem.quantidadeRolosCalculada ?? 0;
    resumo.set(ordem.candidatoId, linha);
  }

  return [...resumo.values()];
}
