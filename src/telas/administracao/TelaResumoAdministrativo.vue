<script setup lang="ts">
import { computed, onMounted } from "vue";
import AppHeader from "@/componentes/AppHeader.vue";
import TabelaOrdens from "@/componentes/TabelaOrdens.vue";
import TabelaDeDados, { type ColunaTabela } from "@/componentes/TabelaDeDados.vue";
import {
  ROTULOS_CARGOS,
  StatusOrdemDeServico,
  StatusPresenca,
  TipoProcessoProducao,
} from "@/dominio/enumeracoes";
import { usarDados } from "@/composables/usarDados";
import { usarSessao } from "@/composables/usarSessao";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";
import { resumirProducaoPorCandidatoEMaterial } from "@/aplicacao/servicos/resumirProducaoPorCandidato";
import {
  firebaseEstaConfigurado,
  modoDaAplicacao,
} from "@/infraestrutura/firebase/configuracaoFirebase";
import { criarPresencasDemonstrativas } from "@/infraestrutura/demonstracao/dadosDemonstrativos";
import { casosDeUso } from "@/infraestrutura/servicosDaAplicacao";
import { usarNotificacoes } from "@/composables/usarNotificacoes";

const dados = usarDados();
const { usuarioAtual } = usarSessao();
const { notificar } = usarNotificacoes();
const { comRetorno } = usarNavegacaoContextual();
onMounted(() => void inicializarResumo());
const recentes = computed(() =>
  dados.ordens.value.filter((item) => item.status !== StatusOrdemDeServico.CONCLUIDA).slice(0, 5),
);
const concluidas = computed(() =>
  dados.ordens.value.filter((item) => item.status === StatusOrdemDeServico.CONCLUIDA).slice(0, 5),
);
const producao = computed(() =>
  resumirProducaoPorCandidatoEMaterial(
    dados.ordens.value.map((ordem) => ({
      candidatoId: ordem.candidatoId,
      nomeDoCandidato: ordem.nomeDoCandidato,
      materialId: ordem.materialId,
      nomeDoMaterial: ordem.nomeDoMaterial,
      larguraDaUnidadeEmCentimetros: ordem.larguraDaUnidadeEmCentimetros,
      alturaDaUnidadeEmCentimetros: ordem.alturaDaUnidadeEmCentimetros,
      unidadesImpressas:
        ordem.processos.find((processo) => processo.tipo === TipoProcessoProducao.IMPRESSAO)
          ?.unidadesProduzidas ?? 0,
    })),
  ),
);
const usuarios = criarPresencasDemonstrativas(modoDaAplicacao);
const colunasProducao: ColunaTabela[] = [
  { chave: "candidato", rotulo: "Candidato" },
  { chave: "material", rotulo: "Material" },
  { chave: "metragem", rotulo: "Metragem quadrada (m²)", alinhamento: "right" },
];
const colunasUsuarios: ColunaTabela[] = [
  { chave: "status", rotulo: "Status" },
  { chave: "nome", rotulo: "Nome" },
  { chave: "cargo", rotulo: "Cargo" },
];

async function inicializarResumo(): Promise<void> {
  try {
    await dados.carregar();
  } catch {
    return;
  }
  if (!firebaseEstaConfigurado) return;
  try {
    const resultado = await casosDeUso.recalcularRolosUtilizados.executar();
    if (resultado.avisos.length > 0) {
      notificar(
        `O resumo foi carregado, mas o recálculo dos rolos teve ${resultado.avisos.length} aviso(s).`,
        "warning",
      );
    }
  } catch (falha) {
    notificar(
      falha instanceof Error
        ? `Não foi possível recalcular os rolos: ${falha.message}`
        : "Não foi possível recalcular os rolos dos Materiais.",
      "error",
    );
  }
}
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
      <div>
        <h1>Resumo da produção</h1>
        <p class="muted">
          {{ usuarioAtual?.nome }} · {{ usuarioAtual ? ROTULOS_CARGOS[usuarioAtual.cargo] : "" }}
        </p>
      </div>
      <div class="section-actions">
        <RouterLink class="btn btn--secondary" :to="comRetorno({ name: 'novoMaterial' })"
          >Novo material</RouterLink
        ><RouterLink class="btn btn--primary" :to="comRetorno({ name: 'novaOrdem' })"
          >Nova OS</RouterLink
        >
      </div>
    </div>
    <p v-if="dados.carregando.value" class="state-message">Atualizando resumo...</p>
    <p v-else-if="dados.erro.value" class="state-message state-message--error" role="alert">
      {{ dados.erro.value.message }}
    </p>
    <template v-else>
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
        <p class="muted">Totais impressos consolidados por candidato e material.</p>
        <TabelaDeDados
          :colunas="colunasProducao"
          :linhas="producao"
          rotulo="Produção consolidada por candidato e material"
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
    </template>
  </main>
</template>
