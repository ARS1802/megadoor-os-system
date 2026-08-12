<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import AppHeader from "@/componentes/AppHeader.vue";
import TabelaOrdens from "@/componentes/TabelaOrdens.vue";
import { ROTULOS_STATUS_ORDEM, StatusOrdemDeServico } from "@/dominio/enumeracoes";
import { usarDados } from "@/composables/usarDados";
import { usarNotificacoes } from "@/composables/usarNotificacoes";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";

const dados = usarDados();
const campos = reactive({ candidato: "", status: "TODOS" });
const aplicados = ref({ candidato: "", status: "TODOS" });
const { notificar } = usarNotificacoes();
const { destinoDeRetorno } = usarNavegacaoContextual();
onMounted(() => void dados.carregar());
const filtradas = computed(() =>
  dados.ordens.value.filter(
    (ordem) =>
      (!aplicados.value.candidato ||
        ordem.nomeDoCandidato
          .toLocaleLowerCase("pt-BR")
          .includes(aplicados.value.candidato.toLocaleLowerCase("pt-BR"))) &&
      (aplicados.value.status === "TODOS" || ordem.status === aplicados.value.status),
  ),
);
function aplicar() {
  aplicados.value = { ...campos };
  notificar("Filtros aplicados.", "blue");
}
function limpar() {
  campos.candidato = "";
  campos.status = "TODOS";
  aplicar();
}
</script>

<template>
  <main class="page-shell">
    <AppHeader
      titulo="Histórico de Ordens de Serviço"
      :voltar-para="destinoDeRetorno"
      rotulo-voltar="Painel"
    />
    <section class="card">
      <h1>Filtros do histórico</h1>
      <div class="form-grid">
        <div class="field">
          <label for="candidate-filter">Candidato</label
          ><input id="candidate-filter" v-model="campos.candidato" />
        </div>
        <div class="field">
          <label for="status-filter">Estado</label
          ><select id="status-filter" v-model="campos.status">
            <option value="TODOS">Todos</option>
            <option v-for="status in StatusOrdemDeServico" :key="status" :value="status">
              {{ ROTULOS_STATUS_ORDEM[status] }}
            </option>
          </select>
        </div>
      </div>
      <div class="button-row">
        <button class="btn btn--primary" @click="aplicar">Aplicar</button
        ><button class="btn btn--secondary" @click="limpar">Limpar</button>
      </div>
    </section>
    <TabelaOrdens :ordens="filtradas" rotulo="Histórico de Ordens de Serviço" />
  </main>
</template>
