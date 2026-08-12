import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calcularSha256Incremental,
  TAMANHO_DO_BLOCO_SHA256_EM_BYTES,
} from "@/infraestrutura/arquivos/calcularSha256Incremental";
import { calcularSha256DoArquivo } from "@/infraestrutura/arquivos/calcularSha256DoArquivo";
import type {
  RespostaDoCalculoSha256,
  SolicitacaoDeCalculoSha256,
} from "@/infraestrutura/arquivos/protocoloSha256";

function sha256DeReferencia(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("cálculo SHA-256 incremental", () => {
  it("calcula o vetor conhecido do arquivo vazio", async () => {
    await expect(calcularSha256Incremental(new Blob())).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("calcula o vetor conhecido de texto", async () => {
    await expect(calcularSha256Incremental(new Blob(["abc"]))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("calcula corretamente dados binários", async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 127, 128, 254, 255]);

    await expect(calcularSha256Incremental(new Blob([bytes]))).resolves.toBe(
      sha256DeReferencia(bytes),
    );
  });

  it("lê a fronteira de 4 MiB em blocos, sem chamar arrayBuffer no arquivo inteiro", async () => {
    const bytes = new Uint8Array(TAMANHO_DO_BLOCO_SHA256_EM_BYTES + 1);
    bytes[TAMANHO_DO_BLOCO_SHA256_EM_BYTES] = 255;
    const arquivo = new Blob([bytes]);
    const lerArquivoInteiro = vi.spyOn(arquivo, "arrayBuffer");
    const fatiar = vi.spyOn(arquivo, "slice");

    await expect(calcularSha256Incremental(arquivo)).resolves.toBe(sha256DeReferencia(bytes));

    expect(lerArquivoInteiro).not.toHaveBeenCalled();
    expect(fatiar.mock.calls).toEqual([
      [0, TAMANHO_DO_BLOCO_SHA256_EM_BYTES],
      [TAMANHO_DO_BLOCO_SHA256_EM_BYTES, TAMANHO_DO_BLOCO_SHA256_EM_BYTES + 1],
    ]);
  });
});

describe("Web Worker do cálculo SHA-256", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("devolve o hash e encerra o Worker depois do sucesso", async () => {
    const hash = "a".repeat(64);
    const encerrar = vi.fn();

    class WorkerSimulado {
      onmessage: ((evento: MessageEvent<RespostaDoCalculoSha256>) => void) | null = null;
      onerror: ((evento: ErrorEvent) => void) | null = null;
      onmessageerror: ((evento: MessageEvent) => void) | null = null;
      terminate = encerrar;

      postMessage(_solicitacao: SolicitacaoDeCalculoSha256): void {
        queueMicrotask(() =>
          this.onmessage?.(new MessageEvent("message", { data: { sucesso: true, sha256: hash } })),
        );
      }
    }

    vi.stubGlobal("Worker", WorkerSimulado);

    await expect(calcularSha256DoArquivo(new Blob(["conteudo"]))).resolves.toBe(hash);
    expect(encerrar).toHaveBeenCalledOnce();
  });

  it("propaga a mensagem de falha e encerra o Worker", async () => {
    const encerrar = vi.fn();

    class WorkerSimulado {
      onmessage: ((evento: MessageEvent<RespostaDoCalculoSha256>) => void) | null = null;
      onerror: ((evento: ErrorEvent) => void) | null = null;
      onmessageerror: ((evento: MessageEvent) => void) | null = null;
      terminate = encerrar;

      postMessage(_solicitacao: SolicitacaoDeCalculoSha256): void {
        queueMicrotask(() =>
          this.onmessage?.(
            new MessageEvent("message", {
              data: { sucesso: false, mensagem: "Falha de leitura" },
            }),
          ),
        );
      }
    }

    vi.stubGlobal("Worker", WorkerSimulado);

    await expect(calcularSha256DoArquivo(new Blob(["conteudo"]))).rejects.toThrow(
      "Falha de leitura",
    );
    expect(encerrar).toHaveBeenCalledOnce();
  });
});
