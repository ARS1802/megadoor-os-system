<script setup lang="ts">
import { onMounted } from "vue";
import AppHeader from "@/componentes/AppHeader.vue";
import TabelaOrdens from "@/componentes/TabelaOrdens.vue";
import { usarDados } from "@/composables/usarDados";
import { usarSessao } from "@/composables/usarSessao";
import { ROTULOS_CARGOS } from "@/dominio/enumeracoes";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";

defineProps<{ titulo: string; permitirCriacao?: boolean; mostrarAdministracao?: boolean }>();
const dados = usarDados();
const { usuarioAtual } = usarSessao();
const { comRetorno } = usarNavegacaoContextual();
onMounted(() => void dados.carregar().catch(() => undefined));
</script>

<template>
  <main class="page-shell">
    <AppHeader :titulo="titulo">
      <template #inicio
        ><RouterLink
          class="header-link header-link--compact"
          :to="comRetorno({ name: 'configuracoes' })"
          >⚙ Configurações</RouterLink
        ></template
      >
      <template #acoes
        ><RouterLink
          v-if="mostrarAdministracao"
          class="header-link"
          :to="{ name: 'menuAdministrativo' }"
          >Administração</RouterLink
        ><RouterLink class="header-link" :to="comRetorno({ name: 'historico' })"
          >Histórico</RouterLink
        ></template
      >
    </AppHeader>
    <div class="section-heading">
      <div>
        <h1>Ordens de Serviço</h1>
        <p class="muted">
          {{ usuarioAtual?.nome }} · {{ usuarioAtual ? ROTULOS_CARGOS[usuarioAtual.cargo] : "" }}
        </p>
      </div>
      <div v-if="permitirCriacao" class="section-actions">
        <RouterLink class="btn btn--secondary" :to="comRetorno({ name: 'novoMaterial' })"
          >Novo material</RouterLink
        ><RouterLink class="btn btn--primary" :to="comRetorno({ name: 'novaOrdem' })"
          >Nova OS</RouterLink
        >
      </div>
    </div>
    <p v-if="dados.carregando.value" class="state-message">Atualizando ordens...</p>
    <p v-else-if="dados.erro.value" class="state-message state-message--error" role="alert">
      {{ dados.erro.value.message }}
    </p>
    <TabelaOrdens v-else :ordens="dados.ordens.value" />
  </main>
</template>
