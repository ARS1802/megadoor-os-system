import { describe, expect, it, vi } from "vitest";
import { AjustarContadorDeProducao } from "@/aplicacao/casosDeUso/AjustarContadorDeProducao";
import { ForcarConclusaoDaOrdem } from "@/aplicacao/casosDeUso/ForcarConclusaoDaOrdem";
import type { RepositorioDeOrdensDeServico } from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { SentidoDoAjuste, TipoContadorProducao, TipoProcessoProducao } from "@/dominio/enumeracoes";
import type { DocumentReference } from "firebase/firestore";

const referenciaUsuario = { path: "usuarios/admin-1" } as DocumentReference;

describe("sucesso parcial depois de uma gravação no Firestore", () => {
  it("não apresenta o ajuste persistido como falha total quando o append falha", async () => {
    const ajustarProducao = vi.fn().mockResolvedValue({
      variacaoEmUnidades: 10,
      unidadesProduzidas: 10,
      ordemFoiConcluida: false,
      operacaoJaExistia: false,
    });
    const acrescentarRegistro = vi.fn().mockRejectedValue(new Error("servidor ocupado"));
    const caso = new AjustarContadorDeProducao(
      { ajustarProducao } as unknown as RepositorioDeOrdensDeServico,
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
    expect(resultado.aviso).toContain("registro de auditoria não foi confirmado");
    expect(ajustarProducao).toHaveBeenCalledOnce();
    expect(acrescentarRegistro).toHaveBeenCalledOnce();
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
