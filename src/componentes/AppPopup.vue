<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

const propriedades = defineProps<{ aberto: boolean; titulo: string; id?: string }>();
const emitir = defineEmits<{ fechar: [] }>();
const botaoFechar = ref<HTMLButtonElement | null>(null);
let focoAnterior: HTMLElement | null = null;

function devolverFoco(): void {
  const alvo = focoAnterior;
  focoAnterior = null;
  if (alvo?.isConnected) void nextTick(() => alvo.focus());
}

watch(
  () => propriedades.aberto,
  async (aberto) => {
    if (aberto) {
      focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      botaoFechar.value?.focus();
    } else {
      devolverFoco();
    }
  },
);

onBeforeUnmount(devolverFoco);
</script>

<template>
  <Teleport to="body">
    <div v-if="propriedades.aberto" class="popup-backdrop" @click.self="emitir('fechar')">
      <dialog
        :id="propriedades.id"
        class="popup popup-vue"
        open
        aria-modal="true"
        :aria-label="propriedades.titulo"
        @cancel.prevent="emitir('fechar')"
        @keydown.esc.prevent="emitir('fechar')"
      >
        <div class="popup__header">
          <h2>{{ propriedades.titulo }}</h2>
          <button
            ref="botaoFechar"
            class="popup__close"
            type="button"
            aria-label="Fechar popup"
            title="Fechar"
            @click="emitir('fechar')"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div class="popup__body"><slot /></div>
        <div v-if="$slots.acoes" class="popup__footer"><slot name="acoes" /></div>
      </dialog>
    </div>
  </Teleport>
</template>
