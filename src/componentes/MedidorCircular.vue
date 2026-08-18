<script setup lang="ts">
import { computed } from "vue";

const propriedades = defineProps<{
  valor: number;
  maximo: number;
  unidade: string;
}>();

const percentual = computed(() => {
  if (!Number.isFinite(propriedades.valor) || !Number.isFinite(propriedades.maximo)) return 0;
  if (propriedades.maximo <= 0) return 0;
  return Math.min(100, Math.max(0, (propriedades.valor / propriedades.maximo) * 100));
});

const estiloDoPreenchimento = computed(() => ({
  "--meter-progress": `${percentual.value.toFixed(2)}%`,
}));

const valorAcessivel = computed(() =>
  Math.min(propriedades.maximo, Math.max(0, propriedades.valor)),
);
</script>

<template>
  <div
    class="meter-value"
    role="progressbar"
    :aria-valuemin="0"
    :aria-valuemax="maximo"
    :aria-valuenow="valorAcessivel"
    :aria-valuetext="`${valor.toLocaleString('pt-BR')} de ${maximo.toLocaleString('pt-BR')} ${unidade}`"
    :style="estiloDoPreenchimento"
  >
    <span>{{ valor.toLocaleString("pt-BR") }}</span
    ><small>/ {{ maximo.toLocaleString("pt-BR") }} {{ unidade }}</small>
  </div>
</template>
