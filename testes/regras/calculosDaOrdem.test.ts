import { describe, expect, it } from "vitest";
import type { DocumentReference } from "firebase/firestore";
import { OrdemDeServico } from "@/dominio/entidades/OrdemDeServico";
import { TipoProcessoProducao } from "@/dominio/enumeracoes";
import { DimensoesDaUnidade, EspecificacaoDeGrade } from "@/dominio/objetosDeValor";
import {
  calcularMetragemQuadradaProduzida,
  calcularRolosUtilizadosPorMetragem,
} from "@/dominio/servicos/producao";

const referencia = { id: "teste", path: "testes/teste" } as DocumentReference;

function criarOrdem(quantidadeTotal = 30): OrdemDeServico {
  return new OrdemDeServico({
    id: "OS-TESTE",
    referenciaCandidato: referencia,
    referenciaMaterial: referencia,
    referenciaUsuarioCriador: referencia,
    tiragem: 2,
    quantidadeTotal,
    dimensoesDaUnidade: new DimensoesDaUnidade(10, 20),
    especificacaoDeGrade: new EspecificacaoDeGrade(100, 200, 10),
    tiposDeProcessos: [TipoProcessoProducao.IMPRESSAO],
    caminhoRegistro: "ordens-de-servico/OS-TESTE/registro.txt",
    caminhoObservacao: "ordens-de-servico/OS-TESTE/observacao.txt",
  });
}

describe("cálculos derivados da produção", () => {
  it("inicia sem uma cópia informativa de registro", () => {
    expect(criarOrdem().registroMaisRecente).toBe("");
  });

  it("não persiste métricas derivadas na Ordem de Serviço", () => {
    expect(criarOrdem(25)).not.toHaveProperty("metragemQuadradaCalculada");
    expect(criarOrdem(25)).not.toHaveProperty("quantidadeRolosCalculada");
  });

  it("calcula a metragem pela área da unidade e pelas unidades impressas", () => {
    expect(calcularMetragemQuadradaProduzida(10, 20, 0)).toBe(0);
    expect(calcularMetragemQuadradaProduzida(10, 20, 1)).toBeCloseTo(0.02);
    expect(calcularMetragemQuadradaProduzida(10, 20, 25)).toBeCloseTo(0.5);
  });

  it("arredonda uma única vez a área total do Material", () => {
    expect(calcularRolosUtilizadosPorMetragem(0, 100, 500)).toBe(0);
    expect(calcularRolosUtilizadosPorMetragem(5, 100, 500)).toBe(1);
    expect(calcularRolosUtilizadosPorMetragem(5.01, 100, 500)).toBe(2);
    const primeiraOrdem = calcularMetragemQuadradaProduzida(100, 250, 1);
    const segundaOrdem = calcularMetragemQuadradaProduzida(100, 250, 1);
    expect(calcularRolosUtilizadosPorMetragem(primeiraOrdem + segundaOrdem, 100, 500)).toBe(1);
  });

  it("rejeita dimensões e contadores inválidos", () => {
    expect(() => calcularMetragemQuadradaProduzida(0, 20, 1)).toThrow("largura");
    expect(() => calcularMetragemQuadradaProduzida(10, 20, -1)).toThrow("não negativo");
    expect(() => calcularRolosUtilizadosPorMetragem(-1, 100, 500)).toThrow("não negativo");
  });
});
