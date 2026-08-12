<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "@/componentes/AppHeader.vue";
import IdentificadorDaPagina from "@/componentes/IdentificadorDaPagina.vue";
import { TipoProcessoProducao, rotuloDoProcesso } from "@/dominio/enumeracoes";
import { usarDados } from "@/composables/usarDados";
import { usarNotificacoes } from "@/composables/usarNotificacoes";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";
import { firebaseEstaConfigurado } from "@/infraestrutura/firebase/configuracaoFirebase";
import { servidorDeArquivos } from "@/infraestrutura/servicosDaAplicacao";
import {
  gerarCsvDosRegistros,
  interpretarLinhaDeRegistro,
} from "@/aplicacao/servicos/registrosDaOrdem";
import { lerRegistroDemonstrativo } from "@/infraestrutura/demonstracao/registrosDemonstrativos";
const rota = useRoute();
const dados = usarDados();
const { notificar } = usarNotificacoes();
const { preservandoRetorno } = usarNavegacaoContextual();
const id = computed(() => String(rota.params.id));
const ordem = computed(() => dados.ordens.value.find((item) => item.id === id.value));
const campos = reactive({ usuario: "TODOS", processo: "TODOS", data: "" });
const aplicados = ref({ ...campos });
const texto = ref("");
const carregando = ref(true);

const linhas = computed(() =>
  texto.value.split(/\r?\n/).filter(Boolean).map(interpretarLinhaDeRegistro),
);
const filtradas = computed(() =>
  linhas.value.filter(
    (linha) =>
      (aplicados.value.usuario === "TODOS" || linha.nomeDoUsuario === aplicados.value.usuario) &&
      (aplicados.value.processo === "TODOS" || linha.processo === aplicados.value.processo) &&
      (!aplicados.value.data || linha.data === aplicados.value.data),
  ),
);
const usuarios = computed(() => [
  ...new Set(linhas.value.map((linha) => linha.nomeDoUsuario).filter(Boolean)),
]);

onMounted(async () => {
  try {
    await dados.carregar();
  } catch {
    carregando.value = false;
    return;
  }
  try {
    texto.value =
      firebaseEstaConfigurado && ordem.value
        ? await servidorDeArquivos.lerTexto(ordem.value.caminhoRegistro)
        : lerRegistroDemonstrativo(id.value);
  } catch (falha) {
    texto.value = "";
    notificar(
      falha instanceof Error ? falha.message : "O registro real não pôde ser carregado.",
      "error",
    );
  } finally {
    carregando.value = false;
  }
});

function aplicar() {
  aplicados.value = { ...campos };
  notificar("Filtros aplicados.", "blue");
}
function limpar() {
  campos.usuario = "TODOS";
  campos.processo = "TODOS";
  campos.data = "";
  aplicar();
}
function exportar() {
  const conteudo = gerarCsvDosRegistros(filtradas.value);
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `registros-${id.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  notificar("CSV dos registros filtrados exportado.");
}
</script>

<template>
  <main class="page-shell">
    <AppHeader
      titulo="Registros da Ordem de Serviço"
      :voltar-para="preservandoRetorno({ name: 'detalhesOrdem', params: { id } })"
      rotulo-voltar="Detalhes"
    />
    <section class="card">
      <div class="section-heading">
        <h1>Filtros</h1>
        <button class="btn btn--secondary" @click="exportar">Exportar CSV</button>
      </div>
      <div class="form-grid form-grid--three">
        <div class="field">
          <label for="machine-user">Usuário</label
          ><select id="machine-user" v-model="campos.usuario">
            <option>TODOS</option>
            <option v-for="usuario in usuarios" :key="usuario">{{ usuario }}</option>
          </select>
        </div>
        <div class="field">
          <label for="process">Processo</label
          ><select id="process" v-model="campos.processo">
            <option>TODOS</option>
            <option v-for="processo in TipoProcessoProducao" :key="processo" :value="processo">
              {{ rotuloDoProcesso(processo) }}
            </option>
          </select>
        </div>
        <div class="field">
          <label for="audit-date">Data</label
          ><input id="audit-date" v-model="campos.data" type="date" />
        </div>
      </div>
      <div class="button-row">
        <button class="btn btn--primary" @click="aplicar">Aplicar</button
        ><button class="btn btn--secondary" @click="limpar">Limpar</button>
      </div>
      <p class="filter-summary">{{ filtradas.length }} linha(s) após aplicar os filtros.</p>
    </section>
    <section class="record-reader" aria-labelledby="records-title">
      <h2 id="records-title">Alterações registradas</h2>
      <div class="record-reader__viewport" role="log" tabindex="0">
        <p v-if="carregando" class="registro">Carregando registro.txt...</p>
        <p v-for="(linha, indice) in filtradas" :key="indice" class="registro">{{ linha.texto }}</p>
        <p v-if="!carregando && !filtradas.length" class="registro muted">
          Nenhuma linha corresponde aos filtros aplicados.
        </p>
      </div>
    </section>
    <IdentificadorDaPagina rotulo="ID da Ordem de Serviço" :valor="id" />
  </main>
</template>
