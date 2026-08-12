<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

defineProps<{
  titulo: string;
  voltarPara?: RouteLocationRaw;
  rotuloVoltar?: string;
}>();
</script>

<template>
  <header class="app-header">
    <div class="app-header__start">
      <RouterLink v-if="voltarPara" class="header-link header-link--compact" :to="voltarPara">
        ← {{ rotuloVoltar ?? "Voltar" }}
      </RouterLink>
      <slot v-else name="inicio" />
    </div>
    <p class="app-header__center">{{ titulo }}</p>
    <nav class="app-header__end" aria-label="Ações da página"><slot name="acoes" /></nav>
  </header>
</template>
