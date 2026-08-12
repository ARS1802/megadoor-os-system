<script setup lang="ts">
import { computed, ref } from "vue";

export interface ColunaTabela {
  chave: string;
  rotulo: string;
  alinhamento?: "left" | "center" | "right";
}

type Linha = Record<string, unknown> & { id: string };
type Estado = "INDIFERENTE" | "MAIOR_PARA_MENOR" | "MENOR_PARA_MAIOR";

const props = defineProps<{ colunas: ColunaTabela[]; linhas: Linha[]; rotulo: string }>();
const emitir = defineEmits<{ ativarLinha: [linha: Linha] }>();
const colunaAtiva = ref<string | null>(null);
const estado = ref<Estado>("INDIFERENTE");
const linhaSelecionada = ref<string | null>(null);

function comparar(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", {
    sensitivity: "base",
    numeric: true,
  });
}

const linhasOrdenadas = computed(() => {
  if (!colunaAtiva.value || estado.value === "INDIFERENTE") return [...props.linhas];
  const chave = colunaAtiva.value;
  return props.linhas
    .map((linha, indice) => ({ linha, indice }))
    .sort((a, b) => {
      const valorA = a.linha[chave];
      const valorB = b.linha[chave];
      const saoNumeros = typeof valorA === "number" && typeof valorB === "number";
      const highLow = estado.value === "MAIOR_PARA_MENOR";
      const fator = saoNumeros ? (highLow ? -1 : 1) : highLow ? 1 : -1;
      return comparar(valorA, valorB) * fator || a.indice - b.indice;
    })
    .map(({ linha }) => linha);
});

function alternarOrdenacao(chave: string): void {
  if (colunaAtiva.value !== chave) {
    colunaAtiva.value = chave;
    estado.value = "MAIOR_PARA_MENOR";
    return;
  }
  estado.value =
    estado.value === "INDIFERENTE"
      ? "MAIOR_PARA_MENOR"
      : estado.value === "MAIOR_PARA_MENOR"
        ? "MENOR_PARA_MAIOR"
        : "INDIFERENTE";
  if (estado.value === "INDIFERENTE") colunaAtiva.value = null;
}

function indicador(chave: string): string {
  if (colunaAtiva.value !== chave) return "↕";
  return estado.value === "MAIOR_PARA_MENOR" ? "↓" : "↑";
}

function descricaoDaOrdenacao(chave: string): string {
  if (colunaAtiva.value !== chave) return "sem ordenação";
  return estado.value === "MAIOR_PARA_MENOR" ? "HighLow" : "LowHigh";
}

function ativar(linha: Linha): void {
  linhaSelecionada.value = linha.id;
  emitir("ativarLinha", linha);
}

function ativarPeloClique(evento: MouseEvent, linha: Linha): void {
  const alvo = evento.target as HTMLElement;
  if (alvo.closest("a, button, input, select, textarea, [data-ignorar-clique-da-linha]")) return;
  ativar(linha);
}

function ativarPeloTeclado(evento: KeyboardEvent, linha: Linha): void {
  if (evento.key === "Enter" || evento.key === " ") {
    evento.preventDefault();
    ativar(linha);
  }
}
</script>

<template>
  <div class="data-table-wrapper">
    <table class="data-table">
      <caption class="visually-hidden">
        {{
          rotulo
        }}
      </caption>
      <thead>
        <tr>
          <th
            v-for="coluna in colunas"
            :key="coluna.chave"
            :class="`text-${coluna.alinhamento ?? 'left'}`"
          >
            <button
              class="table-sort-button"
              type="button"
              :aria-label="`${coluna.rotulo}: ${descricaoDaOrdenacao(coluna.chave)}. Alterar ordenação`"
              @click="alternarOrdenacao(coluna.chave)"
            >
              <span>{{ coluna.rotulo }}</span
              ><span aria-hidden="true">{{ indicador(coluna.chave) }}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="linha in linhasOrdenadas"
          :key="linha.id"
          tabindex="0"
          class="clickable-row"
          :class="{ 'is-selected': linhaSelecionada === linha.id }"
          :aria-selected="linhaSelecionada === linha.id"
          @click="ativarPeloClique($event, linha)"
          @keydown="ativarPeloTeclado($event, linha)"
        >
          <td
            v-for="coluna in colunas"
            :key="coluna.chave"
            :class="`text-${coluna.alinhamento ?? 'left'}`"
          >
            <slot :name="`cell-${coluna.chave}`" :linha="linha" :valor="linha[coluna.chave]">{{
              linha[coluna.chave]
            }}</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
