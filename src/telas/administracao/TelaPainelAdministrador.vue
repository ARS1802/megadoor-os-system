<script setup lang="ts">
import { computed, onMounted } from "vue";
import AppHeader from "@/componentes/AppHeader.vue";
import TabelaOrdens from "@/componentes/TabelaOrdens.vue";
import { StatusOrdemDeServico } from "@/dominio/enumeracoes";
import { usarDados } from "@/composables/usarDados";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";

const dados = usarDados();
const { comRetorno } = usarNavegacaoContextual();
onMounted(() => void dados.carregar().catch(() => undefined));
const emProducao = computed(() =>
  dados.ordens.value.filter((item) =>
    [StatusOrdemDeServico.EM_PRODUCAO, StatusOrdemDeServico.PARADA].includes(item.status),
  ),
);
</script>

<template>
  <main class="page-shell">
    <AppHeader
      titulo="Painel do administrador"
      :voltar-para="{ name: 'menuAdministrativo' }"
      rotulo-voltar="Menu"
      ><template #acoes
        ><RouterLink class="header-link" :to="{ name: 'resumoAdministrativo' }"
          >Resumo</RouterLink
        ></template
      ></AppHeader
    >
    <div class="section-heading">
      <div>
        <h1>Monitoramento da produção</h1>
        <p class="muted">Atualizações muito rápidas e constantes dos processos ativos.</p>
      </div>
      <RouterLink class="btn btn--primary" :to="comRetorno({ name: 'novaOrdem' })"
        >Nova OS</RouterLink
      >
    </div>
    <p v-if="dados.carregando.value" class="state-message">Atualizando produção...</p>
    <p v-else-if="dados.erro.value" class="state-message state-message--error" role="alert">
      {{ dados.erro.value.message }}
    </p>
    <TabelaOrdens v-else :ordens="emProducao" rotulo="Ordens em produção ou paradas" />
  </main>
</template>
