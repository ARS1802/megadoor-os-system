import { describe, expect, it } from "vitest";
import type { DocumentReference } from "firebase/firestore";
import { Material } from "@/dominio/entidades/Material";
import { OrdemDeServico } from "@/dominio/entidades/OrdemDeServico";
import { TipoProcessoProducao } from "@/dominio/enumeracoes";
import {
  DimensoesDaUnidade,
  DimensoesDoRolo,
  EspecificacaoDeGrade,
} from "@/dominio/objetosDeValor";

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

describe("cálculos da Ordem de Serviço", () => {
  it("calcula a área das grades realmente necessárias", () => {
    expect(criarOrdem(25).calcularQuantidadeDeGrades()).toBe(3);
    expect(criarOrdem(25).calcularMetragemQuadrada()).toBe(6);
  });

  it("calcula rolos somente pelo avanço da altura da grade", () => {
    const material = new Material({
      id: "material",
      nome: "Adesivo",
      marca: "Marca",
      dimensoesDoRolo: new DimensoesDoRolo(106, 500),
      referenciaUsuarioCriador: referencia,
    });
    expect(criarOrdem(30).calcularQuantidadeDeRolos(material)).toBe(2);
  });

  it("rejeita uma grade mais larga que o rolo", () => {
    const material = new Material({
      id: "material",
      nome: "Adesivo",
      marca: "Marca",
      dimensoesDoRolo: new DimensoesDoRolo(99, 5_000),
      referenciaUsuarioCriador: referencia,
    });
    expect(() => criarOrdem().calcularQuantidadeDeRolos(material)).toThrow("largura da grade");
  });
});
