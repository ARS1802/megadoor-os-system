import { describe, expect, it, vi } from "vitest";
import { CriarOrdemDeServico } from "@/aplicacao/casosDeUso/CriarOrdemDeServico";
import type { RepositorioDeOrdensDeServico } from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { Usuario } from "@/dominio/entidades/Usuario";
import { CargoUsuario, TipoProcessoProducao } from "@/dominio/enumeracoes";
import { DimensoesDaUnidade, EspecificacaoDeGrade } from "@/dominio/objetosDeValor";
import type { DocumentReference } from "firebase/firestore";

const referencia = { path: "colecao/documento" } as DocumentReference;
const usuario = new Usuario({
  id: "designer-1",
  nome: "Ana Designer",
  email: "ana@example.com",
  cargo: CargoUsuario.DESIGNER,
});

function arquivoEnviado(tipo: TipoProcessoProducao) {
  return {
    nomeOriginal: `${tipo.toLowerCase()}.pdf`,
    extensao: ".pdf",
    tamanhoEmBytes: 10,
    caminhoNoServidor: `ordens-de-servico/OS-1/${tipo.toLowerCase()}/arte.pdf`,
    modificadoEm: new Date("2026-08-12T12:00:00Z"),
  };
}

function preparar() {
  const ordemDasOperacoes: string[] = [];
  const criarComRelacionamentos = vi.fn(async () => {
    ordemDasOperacoes.push("firestore");
  });
  const removerDiretorioDaOrdem = vi.fn(async () => {
    ordemDasOperacoes.push("remover-diretorio");
  });
  const servidor = {
    criarDiretorioDaOrdem: vi.fn(async () => {
      ordemDasOperacoes.push("diretorio");
    }),
    criarArquivoDeRegistro: vi.fn(async () => {
      ordemDasOperacoes.push("registro");
      return "ordens-de-servico/OS-1/registro.txt";
    }),
    criarArquivoDeObservacao: vi.fn(async () => {
      ordemDasOperacoes.push("observacao");
      return "ordens-de-servico/OS-1/observacao.txt";
    }),
    enviarArquivoDoProcesso: vi.fn(async (_id, tipo: TipoProcessoProducao) => {
      ordemDasOperacoes.push(`arquivo-${tipo}`);
      return arquivoEnviado(tipo);
    }),
    removerDiretorioDaOrdem,
  };
  const repositorio = {
    gerarIdentificador: () => "OS-1",
    criarComRelacionamentos,
  };
  return {
    caso: new CriarOrdemDeServico(
      repositorio as unknown as RepositorioDeOrdensDeServico,
      servidor as unknown as ServidorDeArquivosDaOrdem,
    ),
    servidor,
    criarComRelacionamentos,
    removerDiretorioDaOrdem,
    ordemDasOperacoes,
  };
}

function entrada() {
  return {
    referenciaCandidato: referencia,
    referenciaMaterial: referencia,
    tiragem: 1,
    quantidadeTotal: 100,
    dimensoesDaUnidade: new DimensoesDaUnidade(10, 20),
    especificacaoDeGrade: new EspecificacaoDeGrade(100, 200, 50),
    observacao: "Produzir com atenção.",
    processos: [
      {
        tipo: TipoProcessoProducao.IMPRESSAO,
        arquivo: new File(["impressão"], "impressao.pdf", { type: "application/pdf" }),
      },
      {
        tipo: TipoProcessoProducao.CORTE,
        arquivo: new File(["corte"], "corte.pdf", { type: "application/pdf" }),
      },
    ],
    usuarioCriador: usuario,
    referenciaUsuarioCriador: referencia,
  };
}

describe("criação coordenada da Ordem de Serviço", () => {
  it("conclui cada arquivo antes de iniciar a próxima etapa", async () => {
    const dependencias = preparar();

    await dependencias.caso.executar(entrada());

    expect(dependencias.ordemDasOperacoes).toEqual([
      "diretorio",
      "registro",
      "observacao",
      `arquivo-${TipoProcessoProducao.IMPRESSAO}`,
      `arquivo-${TipoProcessoProducao.CORTE}`,
      "firestore",
    ]);
    expect(dependencias.criarComRelacionamentos).toHaveBeenCalledOnce();
    expect(dependencias.removerDiretorioDaOrdem).not.toHaveBeenCalled();
  });

  it("interrompe uploads posteriores antes de compensar uma falha", async () => {
    const dependencias = preparar();
    dependencias.servidor.enviarArquivoDoProcesso.mockImplementationOnce(
      async (_id, tipo: TipoProcessoProducao) => {
        dependencias.ordemDasOperacoes.push(`arquivo-${tipo}`);
        throw new Error("falha de integridade");
      },
    );

    await expect(dependencias.caso.executar(entrada())).rejects.toThrow("falha de integridade");

    expect(dependencias.servidor.enviarArquivoDoProcesso).toHaveBeenCalledOnce();
    expect(dependencias.ordemDasOperacoes.at(-1)).toBe("remover-diretorio");
    expect(dependencias.criarComRelacionamentos).not.toHaveBeenCalled();
  });

  it("compensa sem iniciar processos quando a observação falha", async () => {
    const dependencias = preparar();
    dependencias.servidor.criarArquivoDeObservacao.mockRejectedValueOnce(
      new Error("falha na observação"),
    );

    await expect(dependencias.caso.executar(entrada())).rejects.toThrow("falha na observação");

    expect(dependencias.servidor.enviarArquivoDoProcesso).not.toHaveBeenCalled();
    expect(dependencias.removerDiretorioDaOrdem).toHaveBeenCalledOnce();
    expect(dependencias.criarComRelacionamentos).not.toHaveBeenCalled();
  });

  it("não inicia o processo seguinte quando o segundo upload falha", async () => {
    const dependencias = preparar();
    dependencias.servidor.enviarArquivoDoProcesso
      .mockImplementationOnce(async (_id, tipo: TipoProcessoProducao) => {
        dependencias.ordemDasOperacoes.push(`arquivo-${tipo}`);
        return arquivoEnviado(tipo);
      })
      .mockImplementationOnce(async (_id, tipo: TipoProcessoProducao) => {
        dependencias.ordemDasOperacoes.push(`arquivo-${tipo}`);
        throw new Error("falha no segundo processo");
      });

    await expect(dependencias.caso.executar(entrada())).rejects.toThrow(
      "falha no segundo processo",
    );

    expect(dependencias.servidor.enviarArquivoDoProcesso).toHaveBeenCalledTimes(2);
    expect(dependencias.removerDiretorioDaOrdem).toHaveBeenCalledOnce();
    expect(dependencias.criarComRelacionamentos).not.toHaveBeenCalled();
  });

  it("remove os arquivos enviados se a persistência Firestore falha", async () => {
    const dependencias = preparar();
    dependencias.criarComRelacionamentos.mockImplementationOnce(async () => {
      dependencias.ordemDasOperacoes.push("firestore");
      throw new Error("falha no Firestore");
    });

    await expect(dependencias.caso.executar(entrada())).rejects.toThrow("falha no Firestore");

    expect(dependencias.servidor.enviarArquivoDoProcesso).toHaveBeenCalledTimes(2);
    expect(dependencias.removerDiretorioDaOrdem).toHaveBeenCalledOnce();
    expect(dependencias.ordemDasOperacoes.at(-1)).toBe("remover-diretorio");
  });

  it("preserva a falha original se a compensação também falha", async () => {
    const dependencias = preparar();
    dependencias.servidor.criarArquivoDeRegistro.mockRejectedValueOnce(new Error("falha original"));
    dependencias.removerDiretorioDaOrdem.mockRejectedValueOnce(new Error("falha na compensação"));

    await expect(dependencias.caso.executar(entrada())).rejects.toThrow("falha original");

    expect(dependencias.removerDiretorioDaOrdem).toHaveBeenCalledOnce();
  });
});
