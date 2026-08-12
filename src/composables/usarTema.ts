import { readonly, ref } from "vue";

type Tema = "light" | "dark";
const CHAVE = "megadoor-theme";
const tema = ref<Tema>((localStorage.getItem(CHAVE) as Tema) === "dark" ? "dark" : "light");

function aplicar(valor: Tema): void {
  tema.value = valor;
  document.documentElement.dataset.theme = valor;
  localStorage.setItem(CHAVE, valor);
}

function alternar(): void {
  aplicar(tema.value === "dark" ? "light" : "dark");
}

aplicar(tema.value);

export function usarTema() {
  return { tema: readonly(tema), aplicar, alternar };
}
