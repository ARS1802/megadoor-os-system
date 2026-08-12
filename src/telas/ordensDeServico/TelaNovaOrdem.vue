<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppHeader from "@/componentes/AppHeader.vue";
import AppPopup from "@/componentes/AppPopup.vue";
import { DimensoesDaUnidade, EspecificacaoDeGrade } from "@/dominio/objetosDeValor";
import { StatusOrdemDeServico, TipoProcessoProducao } from "@/dominio/enumeracoes";
import { esquemaFormularioNovaOrdem } from "@/esquemas/formularios";
import { usarDados } from "@/composables/usarDados";
import { usarSessao } from "@/composables/usarSessao";
import { usarNotificacoes } from "@/composables/usarNotificacoes";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";
import { firebaseEstaConfigurado } from "@/infraestrutura/firebase/configuracaoFirebase";
import { casosDeUso, repositorioDeUsuarios } from "@/infraestrutura/servicosDaAplicacao";
import { extensoesPermitidasParaProcesso } from "@/aplicacao/servicos/validacaoDeArquivoDoProcesso";

interface EntradaArquivo {
  tipo: TipoProcessoProducao;
  rotulo: string;
  extensoes: string[];
  arquivo: File | null;
  valido: boolean;
}
const formulario = reactive({
  candidatoId: "",
  materialId: "",
  tiragem: 1,
  quantidadeTotal: 1,
  larguraUnidade: 1,
  alturaUnidade: 1,
  larguraGrade: 1,
  alturaGrade: 1,
  unidadesPorGrade: 1,
  observacao: "",
});
const arquivos = reactive<EntradaArquivo[]>([
  {
    tipo: TipoProcessoProducao.IMPRESSAO,
    rotulo: "Impressão",
    extensoes: [...extensoesPermitidasParaProcesso(TipoProcessoProducao.IMPRESSAO)],
    arquivo: null,
    valido: false,
  },
  {
    tipo: TipoProcessoProducao.PLOTAGEM,
    rotulo: "Plotagem",
    extensoes: [...extensoesPermitidasParaProcesso(TipoProcessoProducao.PLOTAGEM)],
    arquivo: null,
    valido: false,
  },
  {
    tipo: TipoProcessoProducao.CORTE,
    rotulo: "Corte",
    extensoes: [...extensoesPermitidasParaProcesso(TipoProcessoProducao.CORTE)],
    arquivo: null,
    valido: false,
  },
]);
const popup = ref<"candidato" | "material" | null>(null);
const enviando = ref(false);
const dados = usarDados();
const sessao = usarSessao();
const roteador = useRouter();
const rota = useRoute();
const { notificar } = usarNotificacoes();
const { destinoDeRetorno, comRetorno, preservandoRetorno } = usarNavegacaoContextual();
const candidatoSelecionado = computed(() =>
  dados.candidatos.value.find((item) => item.id === formulario.candidatoId),
);
const materialSelecionado = computed(() =>
  dados.materiais.value.find((item) => item.id === formulario.materialId),
);
const resultadoDaValidacao = computed(() => esquemaFormularioNovaOrdem.safeParse(formulario));
const errosDosCampos = computed(() => {
  const erros: Partial<Record<keyof typeof formulario, string>> = {};
  const resultado = resultadoDaValidacao.value;
  if (resultado.success) return erros;

  for (const problema of resultado.error.issues) {
    const campo = problema.path[0] as keyof typeof formulario | undefined;
    if (campo && !erros[campo]) erros[campo] = problema.message;
  }
  return erros;
});
const arquivosSelecionados = computed(() => arquivos.filter((item) => item.arquivo));
const arquivosEstaoValidos = computed(
  () =>
    arquivosSelecionados.value.length > 0 &&
    arquivosSelecionados.value.every((item) => item.valido),
);
const erroDosArquivos = computed(() => {
  if (!arquivosSelecionados.value.length) return "Selecione ao menos um arquivo de processo.";
  if (!arquivosEstaoValidos.value) return "Corrija os arquivos com extensão inválida.";
  return "";
});
const podeCriarOrdem = computed(
  () =>
    resultadoDaValidacao.value.success &&
    Boolean(candidatoSelecionado.value) &&
    Boolean(materialSelecionado.value) &&
    arquivosEstaoValidos.value &&
    Boolean(sessao.usuarioAtual.value) &&
    !enviando.value,
);
onMounted(async () => {
  try {
    await dados.carregar();
  } catch (falha) {
    notificar(
      falha instanceof Error ? falha.message : "Não foi possível carregar candidatos e materiais.",
      "error",
    );
    return;
  }
  const candidatoCriado = rota.query.candidatoCriado;
  if (
    typeof candidatoCriado === "string" &&
    dados.candidatos.value.some((item) => item.id === candidatoCriado)
  ) {
    formulario.candidatoId = candidatoCriado;
  }
});

function erroDoCampo(campo: keyof typeof formulario): string {
  return errosDosCampos.value[campo] ?? "";
}

function selecionarArquivo(evento: Event, item: EntradaArquivo): void {
  const arquivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
  item.arquivo = arquivo;
  item.valido = Boolean(
    arquivo && item.extensoes.some((extensao) => arquivo.name.toLowerCase().endsWith(extensao)),
  );
}

function escolher(tipo: "candidato" | "material", id: string): void {
  if (tipo === "candidato") formulario.candidatoId = id;
  else formulario.materialId = id;
  popup.value = null;
}

async function criarOrdem(): Promise<void> {
  const resultado = resultadoDaValidacao.value;
  const selecionados = arquivosSelecionados.value;
  if (
    !podeCriarOrdem.value ||
    !resultado.success ||
    !sessao.usuarioAtual.value ||
    !candidatoSelecionado.value ||
    !materialSelecionado.value
  )
    return;
  enviando.value = true;
  try {
    let id: string;
    if (firebaseEstaConfigurado) {
      const ordem = await casosDeUso.criarOrdem.executar({
        referenciaCandidato: dados.referenciaCandidato(formulario.candidatoId),
        referenciaMaterial: dados.referenciaMaterial(formulario.materialId),
        referenciaUsuarioCriador: repositorioDeUsuarios.referencia(sessao.usuarioAtual.value.id),
        tiragem: resultado.data.tiragem,
        quantidadeTotal: resultado.data.quantidadeTotal,
        dimensoesDaUnidade: new DimensoesDaUnidade(
          resultado.data.larguraUnidade,
          resultado.data.alturaUnidade,
        ),
        especificacaoDeGrade: new EspecificacaoDeGrade(
          resultado.data.larguraGrade,
          resultado.data.alturaGrade,
          resultado.data.unidadesPorGrade,
        ),
        observacao: resultado.data.observacao,
        processos: selecionados.map((item) => ({ tipo: item.tipo, arquivo: item.arquivo! })),
        usuarioCriador: sessao.usuarioAtual.value,
      });
      id = ordem.id;
      await dados.carregar();
    } else {
      id = `OS-DEMO-${Date.now()}`;
      dados.adicionarOrdemDemonstrativa({
        id,
        candidatoId: formulario.candidatoId,
        materialId: formulario.materialId,
        nomeDoCandidato: candidatoSelecionado.value.nome,
        partidoDoCandidato: candidatoSelecionado.value.partido,
        cnpjDoCandidato: candidatoSelecionado.value.cnpj,
        nomeDoMaterial: materialSelecionado.value.nome,
        caminhoImagemEtiquetaDoMaterial: materialSelecionado.value.caminhoImagemEtiqueta,
        dimensoesDaUnidade: `${resultado.data.larguraUnidade} × ${resultado.data.alturaUnidade} cm`,
        larguraGrade: resultado.data.larguraGrade,
        alturaGrade: resultado.data.alturaGrade,
        unidadesPorGrade: resultado.data.unidadesPorGrade,
        quantidadeTotal: resultado.data.quantidadeTotal,
        tiragem: resultado.data.tiragem,
        status: StatusOrdemDeServico.PRONTA,
        processos: selecionados.map((item) => ({
          tipo: item.tipo,
          unidadesProduzidas: 0,
          metaDeUnidades: resultado.data.quantidadeTotal,
          nomeArquivo: item.arquivo!.name,
          extensao: item.arquivo!.name.slice(item.arquivo!.name.lastIndexOf(".")),
          tamanhoEmBytes: item.arquivo!.size,
          modificadoEm: new Date(item.arquivo!.lastModified),
          modificadoEmPersistido: new Date(item.arquivo!.lastModified),
          caminhoNoServidor: `ordens-de-servico/${id}/${item.tipo.toLowerCase()}/${item.arquivo!.name}`,
        })),
        caminhoRegistro: `ordens-de-servico/${id}/registro.txt`,
        caminhoObservacao: `ordens-de-servico/${id}/observacao.txt`,
        observacaoDemonstrativa: resultado.data.observacao,
        criadaEm: new Date(),
      });
    }
    notificar("Ordem de Serviço criada.");
    await roteador.push(preservandoRetorno({ name: "detalhesOrdem", params: { id } }));
  } catch (falha) {
    notificar(falha instanceof Error ? falha.message : "Não foi possível criar a OS.", "error");
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <main class="page-shell">
    <AppHeader
      titulo="Nova Ordem de Serviço"
      :voltar-para="destinoDeRetorno"
      rotulo-voltar="Painel"
    />
    <form @submit.prevent="criarOrdem">
      <section class="card">
        <h1>Identificação</h1>
        <div class="form-grid">
          <div class="field">
            <label for="selected-candidate">Candidato</label>
            <div class="input-action">
              <input
                id="selected-candidate"
                :value="candidatoSelecionado?.nome ?? ''"
                readonly
                required
                :aria-invalid="!candidatoSelecionado"
                aria-describedby="candidate-error"
              /><button class="btn btn--secondary" type="button" @click="popup = 'candidato'">
                Selecionar
              </button>
            </div>
          </div>
          <div class="field">
            <label for="selected-material">Material</label>
            <div class="input-action">
              <input
                id="selected-material"
                :value="materialSelecionado?.nome ?? ''"
                readonly
                required
                :aria-invalid="!materialSelecionado"
                aria-describedby="material-error"
              /><button class="btn btn--secondary" type="button" @click="popup = 'material'">
                Selecionar
              </button>
            </div>
          </div>
        </div>
        <div class="card-validation" aria-live="polite">
          <p v-if="!candidatoSelecionado" id="candidate-error" class="field__error">
            {{ erroDoCampo("candidatoId") || "Selecione um candidato válido." }}
          </p>
          <p v-if="!materialSelecionado" id="material-error" class="field__error">
            {{ erroDoCampo("materialId") || "Selecione um material válido." }}
          </p>
        </div>
      </section>
      <section class="card">
        <h2>Unidade</h2>
        <div class="form-grid form-grid--three">
          <div class="field">
            <label for="unit-width">Largura (cm)</label
            ><input
              id="unit-width"
              v-model.number="formulario.larguraUnidade"
              type="number"
              min="0.01"
              step="0.01"
              required
              :aria-invalid="Boolean(erroDoCampo('larguraUnidade'))"
            />
          </div>
          <div class="field">
            <label for="unit-height">Altura (cm)</label
            ><input
              id="unit-height"
              v-model.number="formulario.alturaUnidade"
              type="number"
              min="0.01"
              step="0.01"
              required
              :aria-invalid="Boolean(erroDoCampo('alturaUnidade'))"
            />
          </div>
          <div class="field">
            <label for="quantity">Quantidade total</label
            ><input
              id="quantity"
              v-model.number="formulario.quantidadeTotal"
              type="number"
              min="1"
              step="1"
              required
              :aria-invalid="Boolean(erroDoCampo('quantidadeTotal'))"
            />
          </div>
        </div>
        <div class="card-validation" aria-live="polite">
          <p v-if="erroDoCampo('larguraUnidade')" class="field__error">
            {{ erroDoCampo("larguraUnidade") }}
          </p>
          <p v-if="erroDoCampo('alturaUnidade')" class="field__error">
            {{ erroDoCampo("alturaUnidade") }}
          </p>
          <p v-if="erroDoCampo('quantidadeTotal')" class="field__error">
            {{ erroDoCampo("quantidadeTotal") }}
          </p>
        </div>
      </section>
      <section class="card tiragem-card">
        <h2>Tiragem</h2>
        <p class="muted">Quantidade definida para esta Ordem de Serviço.</p>
        <div class="field tiragem-card__field">
          <label for="print-run">Tiragem</label
          ><input
            id="print-run"
            v-model.number="formulario.tiragem"
            type="number"
            min="1"
            step="1"
            required
            :aria-invalid="Boolean(erroDoCampo('tiragem'))"
            aria-describedby="print-run-error"
          />
        </div>
        <div class="card-validation" aria-live="polite">
          <p v-if="erroDoCampo('tiragem')" id="print-run-error" class="field__error">
            {{ erroDoCampo("tiragem") }}
          </p>
        </div>
      </section>
      <section class="card">
        <h2>Grade</h2>
        <div class="form-grid form-grid--three">
          <div class="field">
            <label for="grade-width">Largura (cm)</label
            ><input
              id="grade-width"
              v-model.number="formulario.larguraGrade"
              type="number"
              min="0.01"
              step="0.01"
              required
              :aria-invalid="Boolean(erroDoCampo('larguraGrade'))"
            />
          </div>
          <div class="field">
            <label for="grade-height">Altura (cm)</label
            ><input
              id="grade-height"
              v-model.number="formulario.alturaGrade"
              type="number"
              min="0.01"
              step="0.01"
              required
              :aria-invalid="Boolean(erroDoCampo('alturaGrade'))"
            />
          </div>
          <div class="field">
            <label for="units-grade">Unidades por grade</label
            ><input
              id="units-grade"
              v-model.number="formulario.unidadesPorGrade"
              type="number"
              min="1"
              step="1"
              required
              :aria-invalid="Boolean(erroDoCampo('unidadesPorGrade'))"
            />
          </div>
        </div>
        <div class="card-validation" aria-live="polite">
          <p v-if="erroDoCampo('larguraGrade')" class="field__error">
            {{ erroDoCampo("larguraGrade") }}
          </p>
          <p v-if="erroDoCampo('alturaGrade')" class="field__error">
            {{ erroDoCampo("alturaGrade") }}
          </p>
          <p v-if="erroDoCampo('unidadesPorGrade')" class="field__error">
            {{ erroDoCampo("unidadesPorGrade") }}
          </p>
        </div>
      </section>
      <section class="card">
        <h2>Processos e arquivos</h2>
        <p class="muted">O arquivo selecionado habilita seu respectivo processo.</p>
        <div class="process-file-grid">
          <article
            v-for="item in arquivos"
            :key="item.tipo"
            class="file-upload"
            :class="{
              'is-valid': item.arquivo && item.valido,
              'is-invalid': item.arquivo && !item.valido,
            }"
          >
            <h3>{{ item.rotulo }}</h3>
            <label class="field__label" :for="`arquivo-${item.tipo}`"
              >Arquivo de {{ item.rotulo.toLowerCase() }}</label
            ><input
              :id="`arquivo-${item.tipo}`"
              type="file"
              :accept="item.extensoes.join(',')"
              @change="selecionarArquivo($event, item)"
            />
            <p class="file-upload__status">
              {{
                !item.arquivo
                  ? `Permitidas: ${item.extensoes.join(", ")}`
                  : item.valido
                    ? `Arquivo válido: ${item.arquivo.name}`
                    : `Extensão inválida: ${item.arquivo.name}`
              }}
            </p>
          </article>
        </div>
        <div class="card-validation" aria-live="polite">
          <p v-if="erroDosArquivos" class="field__error">{{ erroDosArquivos }}</p>
        </div>
      </section>
      <section class="card">
        <h2>Observação</h2>
        <div class="field">
          <label for="observation">Texto de observacao.txt</label
          ><textarea
            id="observation"
            v-model="formulario.observacao"
            rows="6"
            placeholder="Informações importantes para a produção."
          ></textarea>
        </div>
      </section>
      <div class="button-row button-row--end">
        <RouterLink class="btn btn--secondary" :to="destinoDeRetorno">Cancelar</RouterLink
        ><button class="btn btn--primary" type="submit" :disabled="!podeCriarOrdem">
          {{ enviando ? "Criando..." : "Criar Ordem de Serviço" }}
        </button>
      </div>
    </form>
    <AppPopup :aberto="popup === 'candidato'" titulo="Candidatos" @fechar="popup = null"
      ><div class="option-list">
        <button
          v-for="item in dados.candidatos.value"
          :key="item.id"
          class="option-button"
          @click="escolher('candidato', item.id)"
        >
          <strong>{{ item.nome }}</strong
          ><span>{{ item.detalhe }}</span>
        </button>
      </div>
      <template #acoes
        ><RouterLink
          class="btn btn--primary"
          :to="comRetorno({ name: 'novoCandidato' })"
          @click="popup = null"
          >Novo candidato</RouterLink
        ><button class="btn btn--secondary" @click="popup = null">Cancelar</button></template
      ></AppPopup
    >
    <AppPopup :aberto="popup === 'material'" titulo="Materiais" @fechar="popup = null"
      ><div class="option-list">
        <button
          v-for="item in dados.materiais.value"
          :key="item.id"
          class="option-button"
          @click="escolher('material', item.id)"
        >
          <strong>{{ item.nome }}</strong
          ><span>{{ item.detalhe }}</span>
        </button>
      </div>
      <template #acoes
        ><RouterLink class="btn btn--primary" :to="comRetorno({ name: 'novoMaterial' })"
          >Novo material</RouterLink
        ><button class="btn btn--secondary" @click="popup = null">Cancelar</button></template
      ></AppPopup
    >
  </main>
</template>
