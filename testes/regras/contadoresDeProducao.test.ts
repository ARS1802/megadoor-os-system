import { describe, expect, it } from "vitest";
import {
  calcularMedidoresDaProducao,
  calcularVariacaoEmUnidades,
} from "@/dominio/servicos/producao";
import { SentidoDoAjuste, TipoContadorProducao } from "@/dominio/enumeracoes";

describe("abstração de grades sobre unidades", () => {
  it("converte uma grade em X unidades", () => {
    expect(
      calcularVariacaoEmUnidades(TipoContadorProducao.GRADE, SentidoDoAjuste.ADICIONAR, 52, 1),
    ).toBe(52);
    expect(
      calcularVariacaoEmUnidades(TipoContadorProducao.GRADE, SentidoDoAjuste.REMOVER, 52, 1),
    ).toBe(-52);
  });

  it("ajusta várias unidades em uma única operação", () => {
    expect(
      calcularVariacaoEmUnidades(TipoContadorProducao.UNIDADE, SentidoDoAjuste.ADICIONAR, 52, 173),
    ).toBe(173);
    expect(
      calcularVariacaoEmUnidades(TipoContadorProducao.UNIDADE, SentidoDoAjuste.REMOVER, 52, 173),
    ).toBe(-173);
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    "rejeita quantidade unitária inválida: %s",
    (quantidade) => {
      expect(() =>
        calcularVariacaoEmUnidades(
          TipoContadorProducao.UNIDADE,
          SentidoDoAjuste.ADICIONAR,
          52,
          quantidade,
        ),
      ).toThrow("inteiro maior que zero");
    },
  );

  it("não transforma Grade em um segundo contador", () => {
    expect(() =>
      calcularVariacaoEmUnidades(TipoContadorProducao.GRADE, SentidoDoAjuste.ADICIONAR, 52, 2),
    ).toThrow("exatamente uma grade");
  });

  it.each([
    [28, 4, 1, 2],
    [30, 4, 1, 0],
    [35, 5, 0, 0],
  ])(
    "deriva os medidores para %i de 30 unidades",
    (unidades, gradesProduzidas, gradesFaltantes, unidadesFaltantes) => {
      expect(calcularMedidoresDaProducao(unidades, 30, 7)).toEqual({
        gradesProduzidas,
        gradesNecessarias: 5,
        gradesFaltantes,
        unidadesProduzidas: unidades,
        quantidadeTotal: 30,
        unidadesFaltantes,
      });
    },
  );
});
