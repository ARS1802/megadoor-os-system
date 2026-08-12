<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import BarraDeProgresso from "@/componentes/BarraDeProgresso.vue";
import TabelaDeDados, { type ColunaTabela } from "@/componentes/TabelaDeDados.vue";
import type { ModeloOrdemNoPainel } from "@/aplicacao/modelosDeTela";
import { ROTULOS_STATUS_ORDEM } from "@/dominio/enumeracoes";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";

const props = defineProps<{ ordens: ModeloOrdemNoPainel[]; rotulo?: string }>();
const roteador = useRouter();
const { comRetorno } = usarNavegacaoContextual();
const colunas: ColunaTabela[] = [
  { chave: "nomeDoCandidato", rotulo: "Candidato" },
  { chave: "nomeDoMaterial", rotulo: "Material" },
  { chave: "dimensoesDaUnidade", rotulo: "Tamanho" },
  { chave: "quantidadeTotal", rotulo: "Quantidade", alinhamento: "right" },
  { chave: "tiragem", rotulo: "Tiragem", alinhamento: "right" },
  { chave: "status", rotulo: "Estado" },
  { chave: "progresso", rotulo: "Progresso" },
];

const linhas = computed(() =>
  props.ordens.map((ordem) => {
    const progresso = ordem.processos.length
      ? ordem.processos.reduce(
          (total, processo) =>
            total + Math.min(100, (processo.unidadesProduzidas / processo.metaDeUnidades) * 100),
          0,
        ) / ordem.processos.length
      : 0;
    return { ...ordem, progresso };
  }),
);

function abrir(linha: Record<string, unknown> & { id: string }): void {
  void roteador.push(comRetorno({ name: "detalhesOrdem", params: { id: linha.id } }));
}
</script>

<template>
  <TabelaDeDados
    :colunas="colunas"
    :linhas="linhas"
    :rotulo="rotulo ?? 'Ordens de Serviço'"
    @ativar-linha="abrir"
  >
    <template #cell-nomeDoCandidato="{ linha }"
      ><RouterLink
        class="row-link"
        :to="comRetorno({ name: 'detalhesOrdem', params: { id: linha.id } })"
        @click.stop
        >{{ linha.nomeDoCandidato }}</RouterLink
      ></template
    >
    <template #cell-quantidadeTotal="{ valor }">{{
      Number(valor).toLocaleString("pt-BR")
    }}</template>
    <template #cell-status="{ valor }"
      ><span class="status-symbol" :class="`status-symbol--${valor}`">{{
        ROTULOS_STATUS_ORDEM[valor]
      }}</span></template
    >
    <template #cell-progresso="{ valor }"><BarraDeProgresso :valor="Number(valor)" /></template>
  </TabelaDeDados>
</template>
