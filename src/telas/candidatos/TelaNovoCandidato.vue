<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import AppHeader from "@/componentes/AppHeader.vue";
import { TipoDocumentoFiscal } from "@/dominio/enumeracoes";
import { usarDados } from "@/composables/usarDados";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";
import { usarNotificacoes } from "@/composables/usarNotificacoes";
import { usarSessao } from "@/composables/usarSessao";
import { esquemaFormularioNovoCandidato } from "@/esquemas/formularios";
import { firebaseEstaConfigurado } from "@/infraestrutura/firebase/configuracaoFirebase";
import { repositorioDeUsuarios, casosDeUso } from "@/infraestrutura/servicosDaAplicacao";

const formulario = reactive({
  nome: "",
  partido: "",
  tipoDocumentoFiscal: TipoDocumentoFiscal.CNPJ,
  numeroDocumentoFiscal: "",
  observacoes: "",
});
const enviando = ref(false);
const erroDeEnvio = ref("");
const sessao = usarSessao();
const dados = usarDados();
const roteador = useRouter();
const { destinoDeRetorno } = usarNavegacaoContextual();
const { notificar } = usarNotificacoes();

const resultadoDaValidacao = computed(() => esquemaFormularioNovoCandidato.safeParse(formulario));
const errosDosCampos = computed(() => {
  const erros: Record<string, string> = {};
  const resultado = resultadoDaValidacao.value;
  if (resultado.success) return erros;
  for (const problema of resultado.error.issues) {
    const campo = problema.path[0];
    if (typeof campo === "string" && !erros[campo]) erros[campo] = problema.message;
  }
  return erros;
});
const podeSalvar = computed(
  () => resultadoDaValidacao.value.success && Boolean(sessao.usuarioAtual.value) && !enviando.value,
);

function erroDoCampo(campo: keyof typeof formulario): string {
  return errosDosCampos.value[campo] ?? "";
}

function retornoComCandidatoSelecionado(candidatoId: string): RouteLocationRaw {
  const retorno = roteador.resolve(destinoDeRetorno.value);
  if (retorno.name !== "novaOrdem") return destinoDeRetorno.value;
  return {
    path: retorno.path,
    query: { ...retorno.query, candidatoCriado: candidatoId },
    hash: retorno.hash,
  };
}

async function salvar(): Promise<void> {
  erroDeEnvio.value = "";
  const resultado = resultadoDaValidacao.value;
  const usuario = sessao.usuarioAtual.value;
  if (!resultado.success || !usuario) return;

  enviando.value = true;
  try {
    let candidatoId: string;
    const numeroDocumento = resultado.data.numeroDocumentoFiscal || undefined;
    if (firebaseEstaConfigurado) {
      const candidato = await casosDeUso.criarCandidato.executar({
        nome: resultado.data.nome,
        partido: resultado.data.partido || undefined,
        documentoFiscal: numeroDocumento
          ? { tipo: resultado.data.tipoDocumentoFiscal, numero: numeroDocumento }
          : undefined,
        observacoes: resultado.data.observacoes || undefined,
        referenciaUsuarioCriador: repositorioDeUsuarios.referencia(usuario.id),
      });
      candidatoId = candidato.id;
      await dados.carregar();
    } else {
      candidatoId = dados.adicionarCandidatoDemonstrativo({
        nome: resultado.data.nome,
        partido: resultado.data.partido || undefined,
        tipoDocumentoFiscal: numeroDocumento ? resultado.data.tipoDocumentoFiscal : undefined,
        numeroDocumentoFiscal: numeroDocumento,
      }).id;
    }

    notificar(`Candidato ${resultado.data.nome} cadastrado.`);
    await roteador.push(retornoComCandidatoSelecionado(candidatoId));
  } catch (falha) {
    erroDeEnvio.value =
      falha instanceof Error ? falha.message : "Não foi possível cadastrar o candidato.";
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <main class="page-shell page-shell--narrow">
    <AppHeader titulo="Novo candidato" :voltar-para="destinoDeRetorno" rotulo-voltar="Voltar" />
    <form class="card material-form" novalidate @submit.prevent="salvar">
      <h1>Cadastrar candidato</h1>
      <p class="muted">
        Cadastre as informações usadas para identificar o candidato nas Ordens de Serviço.
      </p>

      <div class="field">
        <label for="candidate-name">Nome</label
        ><input
          id="candidate-name"
          v-model.trim="formulario.nome"
          autocomplete="name"
          required
          :aria-invalid="Boolean(erroDoCampo('nome'))"
          aria-describedby="candidate-name-error"
        />
        <p v-if="erroDoCampo('nome')" id="candidate-name-error" class="field__error">
          {{ erroDoCampo("nome") }}
        </p>
      </div>

      <div class="field">
        <label for="candidate-party">Partido (opcional)</label
        ><input id="candidate-party" v-model.trim="formulario.partido" />
      </div>

      <fieldset class="card">
        <legend class="field__label">Documento fiscal (opcional)</legend>
        <div class="form-grid">
          <div class="field">
            <label for="document-type">Tipo</label
            ><select id="document-type" v-model="formulario.tipoDocumentoFiscal">
              <option :value="TipoDocumentoFiscal.CNPJ">CNPJ</option>
              <option :value="TipoDocumentoFiscal.CPF">CPF</option>
            </select>
          </div>
          <div class="field">
            <label for="document-number">Número</label
            ><input
              id="document-number"
              v-model.trim="formulario.numeroDocumentoFiscal"
              inputmode="numeric"
              :placeholder="
                formulario.tipoDocumentoFiscal === TipoDocumentoFiscal.CNPJ
                  ? '00.000.000/0000-00'
                  : '000.000.000-00'
              "
              :aria-invalid="Boolean(erroDoCampo('numeroDocumentoFiscal'))"
              aria-describedby="document-number-error"
            />
            <p
              v-if="erroDoCampo('numeroDocumentoFiscal')"
              id="document-number-error"
              class="field__error"
            >
              {{ erroDoCampo("numeroDocumentoFiscal") }}
            </p>
          </div>
        </div>
      </fieldset>

      <div class="field">
        <label for="candidate-notes">Observações (opcional)</label
        ><textarea
          id="candidate-notes"
          v-model.trim="formulario.observacoes"
          rows="5"
          placeholder="Informações administrativas sobre o candidato."
        ></textarea>
      </div>

      <p v-if="erroDeEnvio" class="field__error" role="alert">{{ erroDeEnvio }}</p>
      <div class="button-row button-row--end">
        <RouterLink class="btn btn--secondary" :to="destinoDeRetorno">Cancelar</RouterLink
        ><button class="btn btn--primary" type="submit" :disabled="!podeSalvar">
          {{ enviando ? "Cadastrando..." : "Cadastrar candidato" }}
        </button>
      </div>
    </form>
  </main>
</template>
