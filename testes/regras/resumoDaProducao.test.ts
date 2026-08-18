import { describe, expect, it } from "vitest";
import {
  resumirProducaoPorCandidatoEMaterial,
  type OrdemParaResumoDaProducao,
} from "@/aplicacao/servicos/resumirProducaoPorCandidato";

function ordem(
  candidatoId: string,
  candidato: string,
  propriedades: Partial<OrdemParaResumoDaProducao> = {},
): OrdemParaResumoDaProducao {
  return {
    candidatoId,
    nomeDoCandidato: candidato,
    materialId: "material-a",
    nomeDoMaterial: "Material A",
    larguraDaUnidadeEmCentimetros: 10,
    alturaDaUnidadeEmCentimetros: 20,
    unidadesImpressas: 25,
    ...propriedades,
  };
}

describe("resumo da produção por candidato e material", () => {
  it("agrupa várias OS da mesma combinação e soma somente unidades impressas", () => {
    const resumo = resumirProducaoPorCandidatoEMaterial([
      ordem("candidato-a", "Candidato A"),
      ordem("candidato-a", "Candidato A", {
        unidadesImpressas: 5,
      }),
      ordem("candidato-b", "Candidato B"),
    ]);

    expect(resumo).toHaveLength(2);
    expect(resumo[0]).toMatchObject({
      candidato: "Candidato A",
      material: "Material A",
    });
    expect(resumo[0].metragem).toBeCloseTo(0.6);
    expect(resumo[1]).toMatchObject({ candidato: "Candidato B", material: "Material A" });
  });

  it("separa materiais diferentes do mesmo candidato e mantém grupos sem impressão", () => {
    const resumo = resumirProducaoPorCandidatoEMaterial([
      ordem("candidato-a", "Candidato A", { unidadesImpressas: 0 }),
      ordem("candidato-a", "Candidato A", {
        materialId: "material-b",
        nomeDoMaterial: "Material B",
        unidadesImpressas: 10,
      }),
    ]);

    expect(resumo).toHaveLength(2);
    expect(resumo[0]).toMatchObject({ material: "Material A", metragem: 0 });
    expect(resumo[1]).toMatchObject({ material: "Material B" });
    expect(resumo[1].metragem).toBeCloseTo(0.2);
  });
});
