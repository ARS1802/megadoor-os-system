/// <reference lib="webworker" />

import { calcularSha256Incremental } from "./calcularSha256Incremental";
import type { RespostaDoCalculoSha256, SolicitacaoDeCalculoSha256 } from "./protocoloSha256";

const contextoDoWorker = self as unknown as DedicatedWorkerGlobalScope;

contextoDoWorker.addEventListener(
  "message",
  async (evento: MessageEvent<SolicitacaoDeCalculoSha256>) => {
    try {
      const sha256 = await calcularSha256Incremental(evento.data.arquivo);
      const resposta: RespostaDoCalculoSha256 = { sucesso: true, sha256 };
      contextoDoWorker.postMessage(resposta);
    } catch (erro: unknown) {
      const resposta: RespostaDoCalculoSha256 = {
        sucesso: false,
        mensagem: erro instanceof Error ? erro.message : "Não foi possível calcular o SHA-256.",
      };
      contextoDoWorker.postMessage(resposta);
    }
  },
);
