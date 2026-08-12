import { createSHA256 } from "hash-wasm";

export const TAMANHO_DO_BLOCO_SHA256_EM_BYTES = 4 * 1024 * 1024;

/**
 * Calcula o SHA-256 sem carregar o arquivo inteiro na memória.
 *
 * Esta função fica separada do Web Worker para que a leitura em blocos possa
 * ser verificada diretamente nos testes.
 */
export async function calcularSha256Incremental(arquivo: Blob): Promise<string> {
  const calculador = await createSHA256();
  calculador.init();

  for (let inicio = 0; inicio < arquivo.size; inicio += TAMANHO_DO_BLOCO_SHA256_EM_BYTES) {
    const fim = Math.min(inicio + TAMANHO_DO_BLOCO_SHA256_EM_BYTES, arquivo.size);
    const bloco = arquivo.slice(inicio, fim);
    const bytesDoBloco = new Uint8Array(await bloco.arrayBuffer());
    calculador.update(bytesDoBloco);
  }

  return calculador.digest("hex");
}
