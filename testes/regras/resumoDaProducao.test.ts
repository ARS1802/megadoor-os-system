import { describe, expect, it } from "vitest";
import {
  resumirProducaoPorCandidato,
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
    larguraGrade: 100,
    alturaGrade: 200,
    unidadesPorGrade: 10,
    quantidadeTotal: 25,
    quantidadeRolosCalculada: 2,
    ...propriedades,
  };
}

describe("resumo da produção por candidato", () => {
  it("agrupa várias OS do mesmo candidato e soma a metragem e os rolos", () => {
    const resumo = resumirProducaoPorCandidato([
      ordem("candidato-a", "Candidato A"),
      ordem("candidato-a", "Candidato A", {
        larguraGrade: 50,
        alturaGrade: 100,
        unidadesPorGrade: 5,
        quantidadeTotal: 10,
        quantidadeRolosCalculada: 1,
      }),
      ordem("candidato-b", "Candidato B", { quantidadeRolosCalculada: 4 }),
    ]);

    expect(resumo).toHaveLength(2);
    expect(resumo[0]).toMatchObject({
      id: "candidato-a",
      candidato: "Candidato A",
      rolos: 3,
    });
    expect(resumo[0].metragem).toBeCloseTo(7);
    expect(resumo[1]).toMatchObject({ candidato: "Candidato B", rolos: 4 });
  });

  it("não atribui ao candidato rolos ainda não calculados na OS", () => {
    const [resumo] = resumirProducaoPorCandidato([
      ordem("candidato-a", "Candidato A", { quantidadeRolosCalculada: null }),
    ]);

    expect(resumo.rolos).toBe(0);
    expect(resumo.metragem).toBeCloseTo(6);
  });
});
