import type { RespostaDoCalculoSha256, SolicitacaoDeCalculoSha256 } from "./protocoloSha256";

function criarWorkerDoSha256(): Worker {
  return new Worker(new URL("./calculadorSha256.worker.ts", import.meta.url), {
    name: "calculador-sha256",
    type: "module",
  });
}

/**
 * Calcula o SHA-256 fora da thread principal e encerra o Worker ao terminar.
 */
export function calcularSha256DoArquivo(arquivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    let worker: Worker;

    try {
      worker = criarWorkerDoSha256();
    } catch (erro: unknown) {
      reject(
        erro instanceof Error ? erro : new Error("Não foi possível iniciar o cálculo SHA-256."),
      );
      return;
    }

    let finalizado = false;

    const finalizar = (acao: () => void): void => {
      if (finalizado) return;
      finalizado = true;
      worker.terminate();
      acao();
    };

    worker.onmessage = (evento: MessageEvent<RespostaDoCalculoSha256>) => {
      const resposta = evento.data;

      if (resposta?.sucesso === true && typeof resposta.sha256 === "string") {
        finalizar(() => resolve(resposta.sha256));
        return;
      }

      const mensagem =
        resposta?.sucesso === false
          ? resposta.mensagem
          : "O Worker retornou uma resposta SHA-256 inválida.";
      finalizar(() => reject(new Error(mensagem)));
    };

    worker.onerror = (evento: ErrorEvent) => {
      evento.preventDefault();
      finalizar(() => reject(new Error(evento.message || "O cálculo SHA-256 falhou.")));
    };

    worker.onmessageerror = () => {
      finalizar(() => reject(new Error("Não foi possível interpretar a resposta SHA-256.")));
    };

    const solicitacao: SolicitacaoDeCalculoSha256 = { arquivo };

    try {
      worker.postMessage(solicitacao);
    } catch (erro: unknown) {
      finalizar(() =>
        reject(
          erro instanceof Error
            ? erro
            : new Error("Não foi possível enviar o arquivo para o cálculo SHA-256."),
        ),
      );
    }
  });
}
