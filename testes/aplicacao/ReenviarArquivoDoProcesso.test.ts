import { describe, expect, it, vi } from "vitest";
import { ReenviarArquivoDoProcesso } from "@/aplicacao/casosDeUso/ReenviarArquivoDoProcesso";
import type { RepositorioDeOrdensDeServico } from "@/aplicacao/contratos/Repositorios";
import type { ServidorDeArquivosDaOrdem } from "@/aplicacao/contratos/ServidorDeArquivosDaOrdem";
import { Usuario } from "@/dominio/entidades/Usuario";
import { CargoUsuario, TipoProcessoProducao } from "@/dominio/enumeracoes";

const modificadoAntes = new Date("2026-08-12T10:00:00Z");
const modificadoDepois = new Date("2026-08-12T11:00:00Z");
const arquivoAnterior = {
  nomeOriginal: "arte.pdf",
  extensao: ".pdf",
  tamanhoEmBytes: 10,
  caminhoNoServidor: "ordens-de-servico/OS-1/impressao/arte.pdf",
  modificadoEm: modificadoAntes,
};
const arquivoNovo = {
  nomeOriginal: "arte-corrigida.pdf",
  extensao: ".pdf",
  tamanhoEmBytes: 20,
  caminhoNoServidor: "ordens-de-servico/OS-1/impressao/arte--uuid.pdf",
  modificadoEm: modificadoDepois,
};

function preparar() {
  const substituirArquivoDoProcesso = vi.fn().mockResolvedValue({
    arquivoAnterior,
    arquivoNovo,
    atualizadoEm: modificadoDepois,
  });
  const enviarSubstituicaoDoArquivo = vi.fn().mockResolvedValue(arquivoNovo);
  const acrescentarRegistro = vi.fn().mockResolvedValue(undefined);
  const atualizarRegistroMaisRecente = vi.fn().mockResolvedValue(undefined);
  const removerArquivoDoProcesso = vi.fn().mockResolvedValue(undefined);
  const caso = new ReenviarArquivoDoProcesso(
    {
      substituirArquivoDoProcesso,
      atualizarRegistroMaisRecente,
    } as unknown as RepositorioDeOrdensDeServico,
    {
      enviarSubstituicaoDoArquivo,
      acrescentarRegistro,
      removerArquivoDoProcesso,
    } as unknown as ServidorDeArquivosDaOrdem,
  );
  return {
    caso,
    substituirArquivoDoProcesso,
    enviarSubstituicaoDoArquivo,
    acrescentarRegistro,
    atualizarRegistroMaisRecente,
    removerArquivoDoProcesso,
  };
}

const designer = new Usuario({
  id: "designer-1",
  nome: "Ana Designer",
  email: "ana@example.com",
  cargo: CargoUsuario.DESIGNER,
});

function entrada(usuarioResponsavel = designer) {
  return {
    idDaOrdem: "OS-1",
    tipoProcesso: TipoProcessoProducao.IMPRESSAO,
    arquivoAnteriorEsperado: {
      caminhoNoServidor: arquivoAnterior.caminhoNoServidor,
      modificadoEm: arquivoAnterior.modificadoEm,
    },
    novoArquivo: new File(["corrigido"], "arte-corrigida.pdf", {
      type: "application/pdf",
    }),
    usuarioResponsavel,
    caminhoRegistro: "ordens-de-servico/OS-1/registro.txt",
  };
}

describe("reenvio de arquivo de um processo", () => {
  it("faz staging, CAS, append estruturado e só então remove o arquivo anterior", async () => {
    const dependencias = preparar();
    const ordemDasOperacoes: string[] = [];
    dependencias.enviarSubstituicaoDoArquivo.mockImplementation(async () => {
      ordemDasOperacoes.push("upload");
      return arquivoNovo;
    });
    dependencias.substituirArquivoDoProcesso.mockImplementation(async () => {
      ordemDasOperacoes.push("firestore");
      return { arquivoAnterior, arquivoNovo, atualizadoEm: modificadoDepois };
    });
    dependencias.acrescentarRegistro.mockImplementation(async () => {
      ordemDasOperacoes.push("registro");
    });
    dependencias.atualizarRegistroMaisRecente.mockImplementation(async () => {
      ordemDasOperacoes.push("atividade");
    });
    dependencias.removerArquivoDoProcesso.mockImplementation(async () => {
      ordemDasOperacoes.push("limpeza");
    });

    const resultado = await dependencias.caso.executar(entrada());

    expect(resultado).toEqual({ arquivoNovo });
    expect(ordemDasOperacoes).toEqual(["upload", "firestore", "registro", "atividade", "limpeza"]);
    expect(dependencias.substituirArquivoDoProcesso).toHaveBeenCalledWith({
      idDaOrdem: "OS-1",
      tipoProcesso: TipoProcessoProducao.IMPRESSAO,
      arquivoAnteriorEsperado: {
        caminhoNoServidor: arquivoAnterior.caminhoNoServidor,
        modificadoEm: modificadoAntes,
      },
      arquivoNovo,
    });
    const linha = dependencias.acrescentarRegistro.mock.calls[0][1] as string;
    expect(linha).toContain("EVENTO=ARQUIVO_SUBSTITUIDO");
    expect(linha).toContain("USUARIO=Ana Designer");
    expect(linha).toContain("ARQUIVO_ANTERIOR=arte.pdf");
    expect(linha).toContain("ARQUIVO_NOVO=arte-corrigida.pdf");
    expect(dependencias.atualizarRegistroMaisRecente).toHaveBeenCalledWith("OS-1", linha);
  });

  it("apaga o arquivo staged se o CAS no Firestore falhar", async () => {
    const dependencias = preparar();
    dependencias.substituirArquivoDoProcesso.mockRejectedValue(new Error("conflito"));

    await expect(dependencias.caso.executar(entrada())).rejects.toThrow("conflito");
    expect(dependencias.removerArquivoDoProcesso).toHaveBeenCalledWith(
      "OS-1",
      TipoProcessoProducao.IMPRESSAO,
      arquivoNovo.caminhoNoServidor,
    );
    expect(dependencias.acrescentarRegistro).not.toHaveBeenCalled();
    expect(dependencias.atualizarRegistroMaisRecente).not.toHaveBeenCalled();
  });

  it("retorna sucesso com aviso se o append falhar depois do commit", async () => {
    const dependencias = preparar();
    dependencias.acrescentarRegistro.mockRejectedValue(new Error("registro indisponível"));

    const resultado = await dependencias.caso.executar(entrada());

    expect(resultado.arquivoNovo).toBe(arquivoNovo);
    expect(resultado.aviso).toContain("foi substituído");
    expect(resultado.aviso).toContain("auditoria");
    expect(resultado.aviso).toContain("mantido no servidor para recuperação");
    expect(dependencias.removerArquivoDoProcesso).not.toHaveBeenCalled();
    expect(dependencias.atualizarRegistroMaisRecente).not.toHaveBeenCalled();
  });

  it("mantém o reupload quando apenas a atividade recente falha", async () => {
    const dependencias = preparar();
    dependencias.atualizarRegistroMaisRecente.mockRejectedValue(new Error("Firestore offline"));

    const resultado = await dependencias.caso.executar(entrada());

    expect(resultado.arquivoNovo).toBe(arquivoNovo);
    expect(resultado.aviso).toContain("atividade recente");
    expect(dependencias.removerArquivoDoProcesso).toHaveBeenCalledOnce();
  });

  it("mantém o novo arquivo ativo e avisa se a limpeza do anterior falhar", async () => {
    const dependencias = preparar();
    dependencias.removerArquivoDoProcesso.mockRejectedValue(new Error("arquivo anterior em uso"));

    const resultado = await dependencias.caso.executar(entrada());

    expect(resultado.arquivoNovo).toBe(arquivoNovo);
    expect(resultado.aviso).toContain("pendente de limpeza");
    expect(dependencias.acrescentarRegistro).toHaveBeenCalledOnce();
  });

  it("nega o reenvio ao Maquinista antes de enviar qualquer arquivo", async () => {
    const dependencias = preparar();
    const maquinista = new Usuario({
      id: "maq-1",
      nome: "Mário",
      email: "mario@example.com",
      cargo: CargoUsuario.MAQUINISTA,
    });

    await expect(dependencias.caso.executar(entrada(maquinista))).rejects.toThrow(
      "Apenas Designer ou Administrador",
    );
    expect(dependencias.enviarSubstituicaoDoArquivo).not.toHaveBeenCalled();
  });
});
