import { describe, expect, it, vi } from "vitest";
import { AjustarContadorDeProducao } from "@/aplicacao/casosDeUso/AjustarContadorDeProducao";
import { ForcarConclusaoDaOrdem } from "@/aplicacao/casosDeUso/ForcarConclusaoDaOrdem";
import type { RepositorioDeOrdensDeServico } from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { SentidoDoAjuste, TipoContadorProducao, TipoProcessoProducao } from "@/dominio/enumeracoes";
import type { DocumentReference } from "firebase/firestore";

const referenciaUsuario = { path: "usuarios/admin-1" } as DocumentReference;

describe("sucesso parcial depois de uma gravação no Firestore", () => {
  it("informa a idempotência sem repetir o append", async () => {
    const acrescentarRegistro = vi.fn();
    const caso = new AjustarContadorDeProducao(
      {
        ajustarProducao: vi.fn().mockResolvedValue({
          variacaoEmUnidades: 0,
          unidadesProduzidas: 10,
          ordemFoiConcluida: false,
          operacaoJaExistia: true,
        }),
      } as unknown as RepositorioDeOrdensDeServico,
      { acrescentarRegistro } as unknown as ServidorDeArquivosDaOrdem,
    );

    const resultado = await caso.executar(
      {
        idDaOperacao: "operacao-repetida",
        idDaOrdem: "OS-1",
        tipoProcesso: TipoProcessoProducao.IMPRESSAO,
        tipoContador: TipoContadorProducao.UNIDADE,
        sentido: SentidoDoAjuste.ADICIONAR,
        quantidadeDoAjuste: 10,
        referenciaUsuario,
      },
      "ordens-de-servico/OS-1/registro.txt",
      "Ana Operadora",
    );

    expect(resultado.aviso).toContain("já havia sido aplicada");
    expect(acrescentarRegistro).not.toHaveBeenCalled();
  });

  it("não apresenta o ajuste persistido como falha total quando o append falha", async () => {
    const ajustarProducao = vi.fn().mockResolvedValue({
      variacaoEmUnidades: 10,
      unidadesProduzidas: 10,
      ordemFoiConcluida: false,
      operacaoJaExistia: false,
    });
    const acrescentarRegistro = vi.fn().mockRejectedValue(new Error("servidor ocupado"));
    const confirmarSincronizacaoDoRegistro = vi.fn();
    const caso = new AjustarContadorDeProducao(
      {
        ajustarProducao,
        confirmarSincronizacaoDoRegistro,
      } as unknown as RepositorioDeOrdensDeServico,
      { acrescentarRegistro } as unknown as ServidorDeArquivosDaOrdem,
    );

    const resultado = await caso.executar(
      {
        idDaOperacao: "operacao-1",
        idDaOrdem: "OS-1",
        tipoProcesso: TipoProcessoProducao.IMPRESSAO,
        tipoContador: TipoContadorProducao.UNIDADE,
        sentido: SentidoDoAjuste.ADICIONAR,
        quantidadeDoAjuste: 10,
        referenciaUsuario,
      },
      "ordens-de-servico/OS-1/registro.txt",
      "Ana Operadora",
    );

    expect(resultado.unidadesProduzidas).toBe(10);
    expect(resultado.aviso).toContain("confirmação do registro de auditoria ficou pendente");
    expect(ajustarProducao).toHaveBeenCalledOnce();
    expect(acrescentarRegistro).toHaveBeenCalledOnce();
    expect(confirmarSincronizacaoDoRegistro).not.toHaveBeenCalled();
  });

  it("marca a operação como concluída depois do append confirmado", async () => {
    const ajustarProducao = vi.fn().mockResolvedValue({
      variacaoEmUnidades: 1,
      unidadesProduzidas: 1,
      ordemFoiConcluida: false,
      operacaoJaExistia: false,
    });
    const confirmarSincronizacaoDoRegistro = vi.fn().mockResolvedValue(undefined);
    const caso = new AjustarContadorDeProducao(
      {
        ajustarProducao,
        confirmarSincronizacaoDoRegistro,
      } as unknown as RepositorioDeOrdensDeServico,
      {
        acrescentarRegistro: vi.fn().mockResolvedValue(undefined),
      } as unknown as ServidorDeArquivosDaOrdem,
    );

    await caso.executar(
      {
        idDaOperacao: "operacao-confirmada",
        idDaOrdem: "OS-1",
        tipoProcesso: TipoProcessoProducao.IMPRESSAO,
        tipoContador: TipoContadorProducao.UNIDADE,
        sentido: SentidoDoAjuste.ADICIONAR,
        quantidadeDoAjuste: 1,
        referenciaUsuario,
      },
      "ordens-de-servico/OS-1/registro.txt",
      "Ana Operadora",
    );

    expect(confirmarSincronizacaoDoRegistro).toHaveBeenCalledWith("operacao-confirmada");
  });

  it("não repete a conclusão confirmada quando o append falha", async () => {
    const forcarConclusao = vi.fn().mockResolvedValue({
      processos: [
        {
          tipoProcesso: TipoProcessoProducao.CORTE,
          unidadesProduzidas: 80,
          unidadesFaltantes: 20,
        },
      ],
    });
    const acrescentarRegistro = vi.fn().mockRejectedValue(new Error("servidor ocupado"));
    const caso = new ForcarConclusaoDaOrdem(
      { forcarConclusao } as unknown as RepositorioDeOrdensDeServico,
      { acrescentarRegistro } as unknown as ServidorDeArquivosDaOrdem,
    );

    const resultado = await caso.executar({
      idDaOrdem: "OS-1",
      referenciaAdministrador: referenciaUsuario,
      nomeDoAdministrador: "Arthur Admin",
      justificativa: "Arquivo corrigido será enviado depois.",
      caminhoRegistro: "ordens-de-servico/OS-1/registro.txt",
    });

    expect(resultado.processos[0]?.unidadesFaltantes).toBe(20);
    expect(resultado.aviso).toContain("registro de auditoria não foi confirmado");
    expect(forcarConclusao).toHaveBeenCalledOnce();
    expect(acrescentarRegistro).toHaveBeenCalledOnce();
  });
});
