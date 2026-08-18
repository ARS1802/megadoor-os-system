import { describe, expect, it, vi } from "vitest";
import type { DocumentReference } from "firebase/firestore";
import type { RepositorioDeMateriais } from "@/aplicacao/contratos/Repositorios";
import { RecalcularRolosUtilizadosDosMateriais } from "@/aplicacao/casosDeUso/RecalcularRolosUtilizadosDosMateriais";
import { Material } from "@/dominio/entidades/Material";
import { DimensoesDoRolo } from "@/dominio/objetosDeValor";

const referencia = { id: "usuario", path: "usuarios/usuario" } as DocumentReference;

function material(id: string): Material {
  return new Material({
    id,
    nome: `Material ${id}`,
    marca: "Marca",
    dimensoesDoRolo: new DimensoesDoRolo(100, 500),
    referenciaUsuarioCriador: referencia,
  });
}

describe("recálculo dos rolos utilizados", () => {
  it("verifica todos os Materiais e conta somente alterações efetivas", async () => {
    const repositorio = {
      listarAtivos: vi.fn().mockResolvedValue([material("a"), material("b")]),
      recalcularRolosUtilizados: vi
        .fn()
        .mockResolvedValueOnce({ alterado: true, rolosUtilizados: 2, avisos: [] })
        .mockResolvedValueOnce({
          alterado: false,
          rolosUtilizados: 1,
          avisos: ["Referência ausente."],
        }),
    } as unknown as RepositorioDeMateriais;

    const resultado = await new RecalcularRolosUtilizadosDosMateriais(repositorio).executar();

    expect(resultado).toEqual({
      materiaisVerificados: 2,
      materiaisAtualizados: 1,
      avisos: ["Referência ausente."],
    });
    expect(repositorio.recalcularRolosUtilizados).toHaveBeenNthCalledWith(1, "a");
    expect(repositorio.recalcularRolosUtilizados).toHaveBeenNthCalledWith(2, "b");
  });

  it("mantém o recálculo dos outros Materiais quando um deles falha", async () => {
    const repositorio = {
      listarAtivos: vi.fn().mockResolvedValue([material("a"), material("b")]),
      recalcularRolosUtilizados: vi
        .fn()
        .mockRejectedValueOnce(new Error("conflito"))
        .mockResolvedValueOnce({ alterado: true, rolosUtilizados: 1, avisos: [] }),
    } as unknown as RepositorioDeMateriais;

    const resultado = await new RecalcularRolosUtilizadosDosMateriais(repositorio).executar();

    expect(resultado.materiaisAtualizados).toBe(1);
    expect(resultado.avisos).toEqual(["Material Material a: conflito"]);
  });
});
