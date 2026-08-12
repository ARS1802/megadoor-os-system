import { describe, expect, it } from "vitest";
import {
  extensoesPermitidasParaProcesso,
  validarArquivoDoProcesso,
} from "@/aplicacao/servicos/validacaoDeArquivoDoProcesso";
import { TipoProcessoProducao } from "@/dominio/enumeracoes";

describe("validação do arquivo de processo", () => {
  it("mantém formatos distintos para impressão, plotagem e corte", () => {
    expect(extensoesPermitidasParaProcesso(TipoProcessoProducao.IMPRESSAO)).toEqual([
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
    ]);
    expect(extensoesPermitidasParaProcesso(TipoProcessoProducao.PLOTAGEM)).toEqual([
      ".plt",
      ".pdf",
    ]);
    expect(extensoesPermitidasParaProcesso(TipoProcessoProducao.CORTE)).toEqual([".plt", ".pdf"]);
  });

  it("aceita a extensão sem diferenciar maiúsculas de minúsculas", () => {
    const arquivo = new File(["conteúdo"], "impressao-corrigida.PDF", {
      type: "application/pdf",
    });

    expect(validarArquivoDoProcesso(TipoProcessoProducao.IMPRESSAO, arquivo)).toBeNull();
  });

  it("recusa extensão incompatível e arquivo vazio", () => {
    expect(
      validarArquivoDoProcesso(
        TipoProcessoProducao.IMPRESSAO,
        new File(["conteúdo"], "impressao.plt"),
      ),
    ).toContain("aceita apenas .pdf, .jpg, .jpeg, .png");
    expect(validarArquivoDoProcesso(TipoProcessoProducao.CORTE, new File([], "corte.plt"))).toBe(
      "O arquivo selecionado está vazio.",
    );
  });
});
