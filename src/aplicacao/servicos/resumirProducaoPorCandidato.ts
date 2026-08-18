import { calcularMetragemQuadradaProduzida } from "@/dominio/servicos/producao";

export interface OrdemParaResumoDaProducao {
  candidatoId: string;
  nomeDoCandidato: string;
  materialId: string;
  nomeDoMaterial: string;
  larguraDaUnidadeEmCentimetros: number;
  alturaDaUnidadeEmCentimetros: number;
  unidadesImpressas: number;
}

export interface ProducaoResumidaPorCandidatoEMaterial {
  id: string;
  candidato: string;
  material: string;
  metragem: number;
}

export function resumirProducaoPorCandidatoEMaterial(
  ordens: OrdemParaResumoDaProducao[],
): ProducaoResumidaPorCandidatoEMaterial[] {
  const resumo = new Map<string, ProducaoResumidaPorCandidatoEMaterial>();

  for (const ordem of ordens) {
    const chave = `${ordem.candidatoId}\u0000${ordem.materialId}`;
    const linha = resumo.get(chave) ?? {
      id: `${ordem.candidatoId}-${ordem.materialId}`,
      candidato: ordem.nomeDoCandidato,
      material: ordem.nomeDoMaterial,
      metragem: 0,
    };
    linha.metragem += calcularMetragemQuadradaProduzida(
      ordem.larguraDaUnidadeEmCentimetros,
      ordem.alturaDaUnidadeEmCentimetros,
      ordem.unidadesImpressas,
    );
    resumo.set(chave, linha);
  }

  return [...resumo.values()];
}
