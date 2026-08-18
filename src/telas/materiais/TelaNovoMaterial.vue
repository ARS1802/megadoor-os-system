<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/componentes/AppHeader.vue";
import { DimensoesDoRolo } from "@/dominio/objetosDeValor";
import { usarDados } from "@/composables/usarDados";
import { usarSessao } from "@/composables/usarSessao";
import { usarNotificacoes } from "@/composables/usarNotificacoes";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";
import { firebaseEstaConfigurado } from "@/infraestrutura/firebase/configuracaoFirebase";
import { ErroServidorNaoConfigurado } from "@/infraestrutura/servidor/ServidorDeArquivosFastApi";
import { repositorioDeUsuarios, casosDeUso } from "@/infraestrutura/servicosDaAplicacao";

const formulario = reactive({
  nome: "",
  marca: "",
  largura: 106,
  comprimento: 5_000_000,
  gramatura: null as number | null,
});
const etiqueta = ref<File | null>(null);
const erro = ref("");
const enviando = ref(false);
const EXTENSOES_VALIDAS_DA_ETIQUETA = [".jpg", ".jpeg", ".png", ".webp"] as const;
const TIPOS_VALIDOS_DA_ETIQUETA = ["image/jpeg", "image/png", "image/webp"] as const;
const sessao = usarSessao();
const dados = usarDados();
const roteador = useRouter();
const { notificar } = usarNotificacoes();
const { destinoDeRetorno } = usarNavegacaoContextual();

const etiquetaValida = computed(
  () => etiqueta.value !== null && arquivoDeEtiquetaValido(etiqueta.value),
);
const erroDaEtiqueta = computed(() => {
  if (!etiqueta.value || etiquetaValida.value) return "";
  return `Formato inválido: ${etiqueta.value.name}. Selecione uma imagem JPG, PNG ou WebP.`;
});

function arquivoDeEtiquetaValido(arquivo: File): boolean {
  const nome = arquivo.name.toLocaleLowerCase("pt-BR");
  const extensaoValida = EXTENSOES_VALIDAS_DA_ETIQUETA.some((extensao) => nome.endsWith(extensao));
  const tipoValido =
    arquivo.type === "" ||
    TIPOS_VALIDOS_DA_ETIQUETA.includes(
      arquivo.type.toLocaleLowerCase("pt-BR") as (typeof TIPOS_VALIDOS_DA_ETIQUETA)[number],
    );
  return extensaoValida && tipoValido;
}

function selecionarEtiqueta(evento: Event): void {
  etiqueta.value = (evento.target as HTMLInputElement).files?.[0] ?? null;
}

async function salvar(): Promise<void> {
  erro.value = "";
  if (!formulario.nome.trim() || !formulario.marca.trim()) {
    erro.value = "Nome e marca são obrigatórios.";
    return;
  }
  if (erroDaEtiqueta.value) return;
  if (!sessao.usuarioAtual.value) return;
  enviando.value = true;
  try {
    if (firebaseEstaConfigurado) {
      await casosDeUso.criarMaterial.executar({
        nome: formulario.nome,
        marca: formulario.marca,
        dimensoesDoRolo: new DimensoesDoRolo(formulario.largura, formulario.comprimento),
        gramatura: formulario.gramatura ?? undefined,
        etiqueta: etiqueta.value ?? undefined,
        referenciaUsuarioCriador: repositorioDeUsuarios.referencia(sessao.usuarioAtual.value.id),
      });
      await dados.carregar();
    } else {
      const nomeNormalizado = formulario.nome.trim().toLocaleLowerCase("pt-BR");
      if (
        dados.materiais.value.some(
          (item) => item.nome.toLocaleLowerCase("pt-BR") === nomeNormalizado,
        )
      )
        throw new Error("Já existe um material com este nome.");
      dados.adicionarMaterialDemonstrativo(
        formulario.nome.trim(),
        `${formulario.marca} • ${formulario.largura} × ${formulario.comprimento} cm`,
        etiqueta.value ? URL.createObjectURL(etiqueta.value) : undefined,
      );
    }
    notificar("Material cadastrado.");
    await roteador.push(destinoDeRetorno.value);
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível salvar o material.";
    if (falha instanceof ErroServidorNaoConfigurado) notificar(falha.message, "error");
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <main class="page-shell page-shell--narrow">
    <AppHeader titulo="Novo material" :voltar-para="destinoDeRetorno" rotulo-voltar="Painel" />
    <form class="card material-form" @submit.prevent="salvar">
      <h1>Cadastrar material</h1>
      <div class="field">
        <label for="material-name">Nome diferente</label
        ><input id="material-name" v-model.trim="formulario.nome" required />
      </div>
      <fieldset class="card">
        <legend class="field__label">Rolo</legend>
        <div class="form-grid">
          <div class="field">
            <label for="roll-width">Largura (cm)</label
            ><input
              id="roll-width"
              v-model.number="formulario.largura"
              type="number"
              min="0.01"
              step="0.01"
            />
          </div>
          <div class="field">
            <label for="roll-length">Comprimento (cm)</label
            ><input
              id="roll-length"
              v-model.number="formulario.comprimento"
              type="number"
              min="0.01"
              step="0.01"
            />
          </div>
        </div>
      </fieldset>
      <div class="form-grid">
        <div class="field">
          <label for="brand">Marca</label
          ><input id="brand" v-model.trim="formulario.marca" required />
        </div>
        <div class="field">
          <label for="weight">Gramatura (opcional)</label
          ><input id="weight" v-model.number="formulario.gramatura" type="number" min="1" />
        </div>
      </div>
      <section
        class="file-upload material-label-photo"
        :class="{
          'is-valid': etiquetaValida,
          'is-invalid': erroDaEtiqueta,
        }"
        aria-labelledby="label-photo-title"
      >
        <h2 id="label-photo-title">Foto da etiqueta</h2>
        <label class="field__label" for="label-photo">Imagem da etiqueta (opcional)</label
        ><input
          id="label-photo"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          :aria-invalid="Boolean(erroDaEtiqueta)"
          :aria-describedby="erroDaEtiqueta ? 'label-photo-error' : 'label-photo-status'"
          @change="selecionarEtiqueta"
        />
        <p v-if="erroDaEtiqueta" id="label-photo-error" class="file-upload__status" role="alert">
          {{ erroDaEtiqueta }}
        </p>
        <p v-else id="label-photo-status" class="file-upload__status">
          {{
            etiquetaValida
              ? `Imagem válida: ${etiqueta?.name}`
              : "Permitidas: JPG, JPEG, PNG ou WebP. A foto é opcional."
          }}
        </p>
        <p class="field__help">
          Quando selecionada, a imagem será enviada para
          <span class="mono">materiais/{id}</span> no servidor.
        </p>
      </section>
      <p v-if="erro" class="field__error" role="alert">{{ erro }}</p>
      <div class="button-row button-row--end">
        <RouterLink class="btn btn--secondary" :to="destinoDeRetorno">Cancelar</RouterLink
        ><button class="btn btn--primary" :disabled="enviando">Concluir</button>
      </div>
    </form>
  </main>
</template>
