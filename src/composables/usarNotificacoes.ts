import { readonly, ref } from "vue";

export type TipoNotificacao = "success" | "error" | "blue" | "warning";
const mensagem = ref("");
const tipo = ref<TipoNotificacao>("success");
let temporizador: number | undefined;

function notificar(texto: string, novoTipo: TipoNotificacao = "success", duracao = 4000): void {
  mensagem.value = texto;
  tipo.value = novoTipo;
  window.clearTimeout(temporizador);
  temporizador = window.setTimeout(() => (mensagem.value = ""), duracao);
}

export function usarNotificacoes() {
  return { mensagem: readonly(mensagem), tipo: readonly(tipo), notificar };
}
