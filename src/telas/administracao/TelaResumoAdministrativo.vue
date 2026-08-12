<script setup lang="ts">
import { computed, onMounted } from "vue";
import AppHeader from "@/componentes/AppHeader.vue";
import TabelaOrdens from "@/componentes/TabelaOrdens.vue";
import TabelaDeDados, { type ColunaTabela } from "@/componentes/TabelaDeDados.vue";
import { CargoUsuario, StatusOrdemDeServico, StatusPresenca } from "@/dominio/enumeracoes";
import { usarDados } from "@/composables/usarDados";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";
import { resumirProducaoPorCandidato } from "@/aplicacao/servicos/resumirProducaoPorCandidato";

const dados = usarDados();
const { comRetorno } = usarNavegacaoContextual();
onMounted(() => void dados.carregar());
const recentes = computed(() =>
  dados.ordens.value.filter((item) => item.status !== StatusOrdemDeServico.CONCLUIDA).slice(0, 5),
);
const concluidas = computed(() =>
  dados.ordens.value.filter((item) => item.status === StatusOrdemDeServico.CONCLUIDA).slice(0, 5),
);
const producao = computed(() => resumirProducaoPorCandidato(dados.ordens.value));
const usuarios = [
  {
    id: "arthur",
    nome: "Arthur Ramos Souza",
    cargo: CargoUsuario.MAQUINISTA,
    status: StatusPresenca.ONLINE,
  },
  { id: "edson", nome: "Edson", cargo: CargoUsuario.DESIGNER, status: StatusPresenca.ONLINE },
  { id: "junior", nome: "Júnior", cargo: CargoUsuario.ADMIN, status: StatusPresenca.OFFLINE },
];
const colunasProducao: ColunaTabela[] = [
  { chave: "candidato", rotulo: "Candidato" },
  { chave: "metragem", rotulo: "Metragem produzida (m²)", alinhamento: "right" },
  { chave: "rolos", rotulo: "Rolos utilizados", alinhamento: "right" },
];
const colunasUsuarios: ColunaTabela[] = [
  { chave: "status", rotulo: "Status" },
  { chave: "nome", rotulo: "Nome" },
  { chave: "cargo", rotulo: "Cargo" },
];
</script>

<template>
  <main class="page-shell">
    <AppHeader titulo="Resumo administrativo"
      ><template #inicio
        ><RouterLink
          class="header-link header-link--compact"
          :to="comRetorno({ name: 'configuracoes' })"
          >⚙ Configurações</RouterLink
        ></template
      ><template #acoes
        ><RouterLink class="header-link" :to="{ name: 'menuAdministrativo' }"
          >Menu</RouterLink
        ></template
      ></AppHeader
    >
    <div class="section-heading">
      <h1>Resumo da produção</h1>
      <div class="section-actions">
        <RouterLink class="btn btn--secondary" :to="comRetorno({ name: 'novoMaterial' })"
          >Novo material</RouterLink
        ><RouterLink class="btn btn--primary" :to="comRetorno({ name: 'novaOrdem' })"
          >Nova OS</RouterLink
        >
      </div>
    </div>
    <section class="card">
      <h2>Ordens recentes</h2>
      <TabelaOrdens :ordens="recentes" rotulo="Ordens recentes" />
    </section>
    <section class="card">
      <h2>Ordens concluídas</h2>
      <TabelaOrdens :ordens="concluidas" rotulo="Ordens concluídas" />
    </section>
    <section class="card">
      <h2>Produção por Ordem de Serviço</h2>
      <p class="muted">
        Totais consolidados por candidato considerando todas as suas Ordens de Serviço.
      </p>
      <TabelaDeDados
        :colunas="colunasProducao"
        :linhas="producao"
        rotulo="Produção consolidada por candidato"
        @ativar-linha="() => undefined"
        ><template #cell-metragem="{ valor }">{{
          Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
        }}</template></TabelaDeDados
      >
    </section>
    <section class="card">
      <h2>Usuários conectados agora</h2>
      <TabelaDeDados
        :colunas="colunasUsuarios"
        :linhas="usuarios"
        rotulo="Usuários e seus estados de conexão"
        @ativar-linha="() => undefined"
        ><template #cell-status="{ valor }"
          ><span
            class="presence-status"
            :class="
              valor === StatusPresenca.ONLINE
                ? 'presence-status--online'
                : 'presence-status--offline'
            "
            ><span aria-hidden="true">●</span>
            {{ valor === StatusPresenca.ONLINE ? "Online" : "Offline" }}</span
          ></template
        ></TabelaDeDados
      >
    </section>
  </main>
</template>
