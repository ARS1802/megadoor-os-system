<script setup lang="ts">
import { usarNotificacoes } from "@/composables/usarNotificacoes";
const { mensagem, tipo } = usarNotificacoes();
</script>

<template>
  <Transition name="toast">
    <div
      v-if="mensagem"
      class="toast app-toast"
      :class="`app-toast--${tipo}`"
      role="status"
      aria-live="polite"
    >
      {{ mensagem }}
    </div>
  </Transition>
</template>
