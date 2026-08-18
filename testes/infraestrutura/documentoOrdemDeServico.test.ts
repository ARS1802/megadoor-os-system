import { describe, expect, it } from "vitest";
import { esquemaDocumentoOrdemDeServico } from "@/esquemas/documentosFirestore";

const referencia = { path: "colecao/documento" };
const timestamp = { toDate: () => new Date("2026-08-12T12:00:00.000Z") };

function documentoLegado() {
  return {
    referenciaCandidato: referencia,
    referenciaMaterial: referencia,
    referenciaUsuarioCriador: referencia,
    tiragem: 1,
    quantidadeTotal: 30,
    dimensoesDaUnidade: { larguraEmCentimetros: 10, alturaEmCentimetros: 20 },
    especificacaoDeGrade: {
      larguraEmCentimetros: 100,
      alturaEmCentimetros: 200,
      unidadesPorGrade: 7,
    },
    tiposDeProcessos: ["IMPRESSAO"],
    status: "PRONTA",
    ultimaAtividadeEm: null,
    caminhoRegistro: "ordens-de-servico/OS-LEGADA/registro.txt",
    caminhoObservacao: "ordens-de-servico/OS-LEGADA/observacao.txt",
    criadaEm: timestamp,
    atualizadaEm: timestamp,
  };
}

describe("documento Firestore da Ordem de Serviço", () => {
  it("lê uma OS anterior ao campo de registro recente com fallback vazio", () => {
    const resultado = esquemaDocumentoOrdemDeServico.parse(documentoLegado());

    expect(resultado.registroMaisRecente).toBe("");
  });

  it("preserva a linha informativa quando o campo já existe", () => {
    const registroMaisRecente =
      "[2026-08-12T12:05:00.000Z] | USUARIO=Ana | PROCESSO=IMPRESSAO | UNIDADES=+7";
    const resultado = esquemaDocumentoOrdemDeServico.parse({
      ...documentoLegado(),
      registroMaisRecente,
    });

    expect(resultado.registroMaisRecente).toBe(registroMaisRecente);
  });

  it("rejeita as métricas derivadas removidas do documento atual", () => {
    expect(() =>
      esquemaDocumentoOrdemDeServico.parse({
        ...documentoLegado(),
        metragemQuadradaCalculada: 1,
      }),
    ).toThrow();
  });
});
