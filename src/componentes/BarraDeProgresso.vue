<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ valor: number; sucesso?: boolean }>();
const visual = computed(() => Math.max(0, Math.min(100, props.valor)));
const rotulo = computed(
  () => `${props.valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`,
);
</script>

<template>
  <div
    class="progress"
    :class="{ 'progress--success': sucesso || valor >= 100 }"
    role="progressbar"
    :aria-valuenow="visual"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class="progress__bar" :style="{ width: `${visual}%` }"></div>
    <span class="progress__label">{{ rotulo }}</span>
  </div>
</template>
