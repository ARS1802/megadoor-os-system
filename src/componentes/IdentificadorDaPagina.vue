<script setup lang="ts">
defineProps<{ rotulo: string; valor: string }>();
</script>

<template>
  <p class="page-identifier">
    <span>{{ rotulo }}:</span> <code>{{ valor }}</code>
  </p>
</template>
