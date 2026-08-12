import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calcularSha256DoArquivo } from "@/infraestrutura/arquivos/calcularSha256DoArquivo";
import {
  ErroArquivoMuitoGrande,
  ErroChecksumDoArquivo,
  ErroConcorrenciaTemporaria,
  ErroContratoDoServidor,
  ErroIntegridadeDoArquivo,
  ErroServidorMegadoor,
  ServidorDeArquivosFastApi,
} from "@/infraestrutura/servidor/ServidorDeArquivosFastApi";
import { TipoProcessoProducao } from "@/dominio/enumeracoes";

vi.mock("@/infraestrutura/arquivos/calcularSha256DoArquivo", () => ({
  calcularSha256DoArquivo: vi.fn(),
}));

const SHA_LOCAL = "a".repeat(64);

function servidor(): ServidorDeArquivosFastApi {
  return new ServidorDeArquivosFastApi(() => "usuario-designer-1");
}

function respostaDeUpload(
  formulario: FormData,
  alteracoes: Record<string, unknown> = {},
): Response {
  const arquivo = formulario.get("file") as File;
  const caminho = String(formulario.get("path"));
  return Response.json({
    status: "ok",
    saved_as: `${caminho}/${arquivo.name}`,
    filename: arquivo.name,
    size: arquivo.size,
    sha256: SHA_LOCAL,
    ...alteracoes,
  });
}

beforeEach(() => {
  vi.mocked(calcularSha256DoArquivo).mockReset().mockResolvedValue(SHA_LOCAL);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("download autenticado da etiqueta do material", () => {
  it("usa o caminho e a identidade do usuário", async () => {
    const conteudo = new Uint8Array([137, 80, 78, 71]);
    const requisicao = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(conteudo, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    const imagem = await servidor().baixarArquivo("materiais/material-1/etiqueta.png");

    expect(await imagem.arrayBuffer()).toEqual(conteudo.buffer);
    expect(requisicao).toHaveBeenCalledOnce();
    const [url, opcoes] = requisicao.mock.calls[0];
    expect(url).toBe("https://192.168.0.10:8443/api/download");
    expect(opcoes?.method).toBe("POST");
    expect(opcoes?.headers).toEqual({
      "X-User-Id": "usuario-designer-1",
      Authorization: "Bearer usuario-designer-1",
    });
    expect((opcoes?.body as FormData).get("path")).toBe("materiais/material-1/etiqueta.png");
  });

  it("preserva o tipo da imagem ao montar um download com progresso", async () => {
    const conteudo = new Uint8Array([137, 80, 78, 71]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(conteudo, {
        status: 200,
        headers: {
          "Content-Length": String(conteudo.byteLength),
          "Content-Type": "image/png",
        },
      }),
    );

    const imagem = await servidor().baixarArquivo("materiais/material-1/etiqueta.png");

    expect(imagem.type).toBe("image/png");
  });
});

describe("integridade dos uploads", () => {
  it("envia e confere SHA-256 em registro, observação e etiqueta", async () => {
    const requisicao = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, opcoes) => respostaDeUpload(opcoes?.body as FormData));
    const api = servidor();

    await api.criarArquivoDeRegistro("OS-1");
    await api.criarArquivoDeObservacao("OS-1", "Texto da observação");
    await api.enviarImagemDaEtiquetaDoMaterial(
      "material-1",
      new File(["imagem"], "etiqueta.png", { type: "image/png" }),
    );

    expect(calcularSha256DoArquivo).toHaveBeenCalledTimes(3);
    expect(requisicao).toHaveBeenCalledTimes(3);
    for (const chamada of requisicao.mock.calls) {
      expect((chamada[1]?.body as FormData).get("checksum_sha256")).toBe(SHA_LOCAL);
    }
  });

  it("reconstrói o FormData mantendo arquivo, nome, caminho e checksum durante retry", async () => {
    const formularios: FormData[] = [];
    const requisicao = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opcoes) => {
      const formulario = opcoes?.body as FormData;
      formularios.push(formulario);
      if (formularios.length < 3) {
        return Response.json({ detail: "Tente novamente!" }, { status: 409 });
      }
      return respostaDeUpload(formulario, { sha256: SHA_LOCAL.toUpperCase() });
    });
    const aguardar = vi
      .spyOn(
        ServidorDeArquivosFastApi.prototype as unknown as {
          aguardar(atraso: number): Promise<void>;
        },
        "aguardar",
      )
      .mockResolvedValue(undefined);
    const arquivo = new File(["imagem"], "etiqueta.png", { type: "image/png" });

    await servidor().enviarImagemDaEtiquetaDoMaterial("material-1", arquivo);

    expect(requisicao).toHaveBeenCalledTimes(3);
    expect(aguardar.mock.calls).toEqual([[500], [1000]]);
    expect(new Set(formularios).size).toBe(3);
    for (const formulario of formularios) {
      expect(formulario.get("file")).toBe(arquivo);
      expect(formulario.get("path")).toBe("materiais/material-1");
      expect(formulario.get("checksum_sha256")).toBe(SHA_LOCAL);
    }
  });

  it.each([
    ["ausente", {}],
    ["malformado", { sha256: "1234" }],
  ])("recusa o hash %s na resposta do servidor", async (_rotulo, alteracoes) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opcoes) => {
      const resposta = await respostaDeUpload(opcoes?.body as FormData).json();
      delete (resposta as { sha256?: string }).sha256;
      return Response.json({ ...resposta, ...alteracoes });
    });

    await expect(
      servidor().enviarImagemDaEtiquetaDoMaterial(
        "material-1",
        new File(["imagem"], "etiqueta.png", { type: "image/png" }),
      ),
    ).rejects.toBeInstanceOf(ErroContratoDoServidor);
  });

  it("recusa uma resposta 2xx cujo hash diverge do arquivo", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opcoes) =>
      respostaDeUpload(opcoes?.body as FormData, { sha256: "b".repeat(64) }),
    );

    await expect(
      servidor().enviarImagemDaEtiquetaDoMaterial(
        "material-1",
        new File(["imagem"], "etiqueta.png", { type: "image/png" }),
      ),
    ).rejects.toBeInstanceOf(ErroIntegridadeDoArquivo);
  });

  it("recusa caminho, nome ou tamanho diferente do arquivo enviado", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opcoes) =>
      respostaDeUpload(opcoes?.body as FormData, { saved_as: "outro/local.png" }),
    );

    await expect(
      servidor().enviarImagemDaEtiquetaDoMaterial(
        "material-1",
        new File(["imagem"], "etiqueta.png", { type: "image/png" }),
      ),
    ).rejects.toBeInstanceOf(ErroContratoDoServidor);
  });

  it("não envia o arquivo quando o Worker devolve hash inválido", async () => {
    vi.mocked(calcularSha256DoArquivo).mockResolvedValue("inválido");
    const requisicao = vi.spyOn(globalThis, "fetch");

    await expect(
      servidor().enviarImagemDaEtiquetaDoMaterial(
        "material-1",
        new File(["imagem"], "etiqueta.png", { type: "image/png" }),
      ),
    ).rejects.toBeInstanceOf(ErroIntegridadeDoArquivo);
    expect(requisicao).not.toHaveBeenCalled();
  });
});

describe("classificação de falhas e retry limitado", () => {
  it("trata 413 como arquivo acima do limite e não repete", async () => {
    const requisicao = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ detail: "Arquivo excede o limite." }, { status: 413 }));

    await expect(
      servidor().enviarImagemDaEtiquetaDoMaterial(
        "material-1",
        new File(["grande"], "etiqueta.png", { type: "image/png" }),
      ),
    ).rejects.toBeInstanceOf(ErroArquivoMuitoGrande);
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("formata o detalhe 422 e não repete falha de checksum", async () => {
    const requisicao = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json(
          { detail: [{ loc: ["body", "checksum_sha256"], msg: "Checksum não confere" }] },
          { status: 422 },
        ),
      );

    const operacao = servidor().enviarImagemDaEtiquetaDoMaterial(
      "material-1",
      new File(["imagem"], "etiqueta.png", { type: "image/png" }),
    );
    await expect(operacao).rejects.toBeInstanceOf(ErroChecksumDoArquivo);
    await expect(operacao).rejects.toThrow("Checksum não confere");
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("interrompe depois do terceiro conflito temporário", async () => {
    const requisicao = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        Response.json({ detail: "Tente novamente!" }, { status: 409 }),
      );
    const aguardar = vi
      .spyOn(
        ServidorDeArquivosFastApi.prototype as unknown as {
          aguardar(atraso: number): Promise<void>;
        },
        "aguardar",
      )
      .mockResolvedValue(undefined);

    const operacao = servidor().criarDiretorioDaOrdem("OS-1");

    await expect(operacao).rejects.toMatchObject({
      name: "ErroConcorrenciaTemporaria",
      status: 409,
      message: expect.stringContaining("Tente novamente mais tarde"),
    });
    expect(requisicao).toHaveBeenCalledTimes(3);
    expect(aguardar.mock.calls).toEqual([[500], [1000]]);
  });

  it("não repete outro 409", async () => {
    const requisicao = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ detail: "Destino já existe." }, { status: 409 }));

    const operacao = servidor().criarDiretorioDaOrdem("OS-1");

    await expect(operacao).rejects.toBeInstanceOf(ErroServidorMegadoor);
    await expect(operacao).rejects.not.toBeInstanceOf(ErroConcorrenciaTemporaria);
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("não repete erro de rede com resultado desconhecido", async () => {
    const requisicao = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Falha de rede"));

    await expect(servidor().acrescentarRegistro("OS-1/registro.txt", "linha")).rejects.toThrow(
      "Falha de rede",
    );
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("repete apenas a chamada append depois do 409 transitório", async () => {
    const requisicao = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ detail: "Tente novamente!" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));
    vi.spyOn(
      ServidorDeArquivosFastApi.prototype as unknown as {
        aguardar(atraso: number): Promise<void>;
      },
      "aguardar",
    ).mockResolvedValue(undefined);

    await servidor().acrescentarRegistro("ordens-de-servico/OS-1/registro.txt", "linha única");

    expect(requisicao).toHaveBeenCalledTimes(2);
    for (const chamada of requisicao.mock.calls) {
      const formulario = chamada[1]?.body as FormData;
      expect(formulario.get("path")).toBe("ordens-de-servico/OS-1/registro.txt");
      expect(formulario.get("content")).toBe("linha única");
    }
  });
});

describe("arquivos de produção no FastAPI", () => {
  it("consulta /api/list no diretório pai e usa modified_at UTC do caminho exato", async () => {
    const requisicao = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        shared_root: "/dados",
        path: "ordens-de-servico/OS-1/impressao",
        items: [
          {
            name: "parecido.pdf",
            path: "ordens-de-servico/OS-1/impressao/parecido.pdf",
            type: "file",
            size: 10,
            modified_at: "2026-08-12T10:00:00+00:00",
          },
          {
            name: "arte.pdf",
            path: "ordens-de-servico/OS-1/impressao/arte.pdf",
            type: "file",
            size: 2048,
            modified_at: "2026-08-12T14:31:20.123456+00:00",
          },
        ],
      }),
    );

    const metadados = await servidor().obterMetadadosDoArquivo(
      "ordens-de-servico/OS-1/impressao/arte.pdf",
    );

    expect(metadados).toEqual({
      nome: "arte.pdf",
      caminhoNoServidor: "ordens-de-servico/OS-1/impressao/arte.pdf",
      tamanhoEmBytes: 2048,
      modificadoEm: new Date("2026-08-12T14:31:20.123456+00:00"),
    });
    expect((requisicao.mock.calls[0][1]?.body as FormData).get("path")).toBe(
      "ordens-de-servico/OS-1/impressao",
    );
  });

  it("faz reupload com nome físico versionado e preserva o nome original", async () => {
    let caminhoFisico = "";
    const requisicao = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async (_url, opcoes) => {
        const formulario = opcoes?.body as FormData;
        const arquivoEnviado = formulario.get("file") as File;
        expect(arquivoEnviado.name).toMatch(/^arte-corrigida--[0-9a-f-]{36}\.pdf$/);
        expect(formulario.get("checksum_sha256")).toBe(SHA_LOCAL);
        caminhoFisico = `ordens-de-servico/OS-1/impressao/${arquivoEnviado.name}`;
        return respostaDeUpload(formulario);
      })
      .mockImplementationOnce(async (_url, opcoes) => {
        const diretorio = String((opcoes?.body as FormData).get("path"));
        return Response.json({
          shared_root: "/dados",
          path: diretorio,
          items: [
            {
              name: caminhoFisico.split("/").at(-1),
              path: caminhoFisico,
              type: "file",
              size: 9,
              modified_at: "2026-08-12T15:00:00+00:00",
            },
          ],
        });
      });
    const original = new File(["corrigido"], "arte-corrigida.pdf", {
      type: "application/pdf",
    });

    const enviado = await servidor().enviarSubstituicaoDoArquivo(
      "OS-1",
      TipoProcessoProducao.IMPRESSAO,
      original,
    );

    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(enviado.nomeOriginal).toBe("arte-corrigida.pdf");
    expect(enviado.caminhoNoServidor).toBe(caminhoFisico);
    expect(enviado.caminhoNoServidor.endsWith("/arte-corrigida.pdf")).toBe(false);
    expect(enviado.modificadoEm).toEqual(new Date("2026-08-12T15:00:00+00:00"));
  });

  it("recusa remover caminho fora do diretório exato do processo", async () => {
    const requisicao = vi.spyOn(globalThis, "fetch");

    await expect(
      servidor().removerArquivoDoProcesso(
        "OS-1",
        TipoProcessoProducao.IMPRESSAO,
        "ordens-de-servico/OS-1/corte/arte.pdf",
      ),
    ).rejects.toThrow("dentro do processo informado");
    expect(requisicao).not.toHaveBeenCalled();
  });

  it("remove o upload recém-criado se a consulta de metadados falhar", async () => {
    let caminhoStaged = "";
    const requisicao = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async (_url, opcoes) => {
        const formulario = opcoes?.body as FormData;
        const arquivo = formulario.get("file") as File;
        caminhoStaged = `ordens-de-servico/OS-1/impressao/${arquivo.name}`;
        return respostaDeUpload(formulario);
      })
      .mockResolvedValueOnce(Response.json({ detail: "Listagem indisponível" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }));

    await expect(
      servidor().enviarSubstituicaoDoArquivo(
        "OS-1",
        TipoProcessoProducao.IMPRESSAO,
        new File(["corrigido"], "arte.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toThrow("Listagem indisponível");

    expect(requisicao).toHaveBeenCalledTimes(3);
    expect(requisicao.mock.calls[2][0]).toBe("https://192.168.0.10:8443/api/delete");
    expect((requisicao.mock.calls[2][1]?.body as FormData).get("path")).toBe(caminhoStaged);
  });
});
