<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "@/componentes/AppHeader.vue";
import BarraDeProgresso from "@/componentes/BarraDeProgresso.vue";
import IdentificadorDaPagina from "@/componentes/IdentificadorDaPagina.vue";
import MedidorCircular from "@/componentes/MedidorCircular.vue";
import PreviewDeArquivo from "@/componentes/PreviewDeArquivo.vue";
import {
  CargoUsuario,
  ROTULOS_CARGOS,
  SentidoDoAjuste,
  StatusOrdemDeServico,
  TipoContadorProducao,
  TipoProcessoProducao,
  rotuloDoProcesso,
} from "@/dominio/enumeracoes";
import { usarDados } from "@/composables/usarDados";
import { usarSessao } from "@/composables/usarSessao";
import { usarNotificacoes } from "@/composables/usarNotificacoes";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";
import { firebaseEstaConfigurado } from "@/infraestrutura/firebase/configuracaoFirebase";
import { ErroServidorNaoConfigurado } from "@/infraestrutura/servidor/ServidorDeArquivosFastApi";
import {
  calcularMedidoresDaProducao,
  calcularVariacaoEmUnidades,
} from "@/dominio/servicos/producao";
import { criarLinhaDeAjuste } from "@/aplicacao/servicos/registrosDaOrdem";
import { acrescentarRegistroDemonstrativo } from "@/infraestrutura/demonstracao/registrosDemonstrativos";
import {
  casosDeUso,
  repositorioDeOrdens,
  repositorioDeUsuarios,
  servidorDeArquivos,
} from "@/infraestrutura/servicosDaAplicacao";

const rota = useRoute();
const dados = usarDados();
const sessao = usarSessao();
const { notificar } = usarNotificacoes();
const { preservandoRetorno } = usarNavegacaoContextual();
const quantidadeDeUnidades = ref<number | null>(1);
const ajustando = ref(false);
const porcentagemDownload = ref<number | null>(null);
const urlDaPrevia = ref("");
const carregandoPrevia = ref(false);
const erroDaPrevia = ref("");
const id = computed(() => String(rota.params.id));
const tipo = computed(() => String(rota.params.processo).toUpperCase() as TipoProcessoProducao);
const ordem = computed(() => dados.ordens.value.find((item) => item.id === id.value));
const processo = computed(() => ordem.value?.processos.find((item) => item.tipo === tipo.value));
const progresso = computed(() =>
  processo.value ? (processo.value.unidadesProduzidas / processo.value.metaDeUnidades) * 100 : 0,
);
const gradesCompletas = computed(() =>
  processo.value && ordem.value
    ? Math.floor(processo.value.unidadesProduzidas / ordem.value.unidadesPorGrade)
    : 0,
);
const unidadesRestantes = computed(() =>
  processo.value && ordem.value
    ? processo.value.unidadesProduzidas % ordem.value.unidadesPorGrade
    : 0,
);
const medidores = computed(() =>
  ordem.value && processo.value
    ? calcularMedidoresDaProducao(
        processo.value.unidadesProduzidas,
        ordem.value.quantidadeTotal,
        ordem.value.unidadesPorGrade,
      )
    : null,
);
const quantidadeDeUnidadesValida = computed(() => {
  const quantidade = Number(quantidadeDeUnidades.value);
  return Number.isSafeInteger(quantidade) && quantidade > 0;
});
const processoAtingiuMeta = computed(
  () =>
    Boolean(processo.value) && processo.value!.unidadesProduzidas >= processo.value!.metaDeUnidades,
);
const ordemConcluida = computed(() => ordem.value?.status === StatusOrdemDeServico.CONCLUIDA);
const podeAjustarProducao = computed(() =>
  [CargoUsuario.ADMIN, CargoUsuario.DESIGNER, CargoUsuario.MAQUINISTA].includes(
    sessao.usuarioAtual.value?.cargo as CargoUsuario,
  ),
);
let cancelarObservacao: (() => void) | undefined;
let cancelarObservacaoDaOrdem: (() => void) | undefined;
let urlTemporariaDaPrevia = "";
let versaoDoCarregamentoDaPrevia = 0;
const consultasDeMetadados = new Map<
  string,
  ReturnType<typeof servidorDeArquivos.obterMetadadosDoArquivo>
>();

function consultarMetadadosDoArquivo(caminho: string) {
  const consultaExistente = consultasDeMetadados.get(caminho);
  if (consultaExistente) return consultaExistente;
  const novaConsulta = servidorDeArquivos.obterMetadadosDoArquivo(caminho).catch((falha) => {
    if (consultasDeMetadados.get(caminho) === novaConsulta) consultasDeMetadados.delete(caminho);
    throw falha;
  });
  consultasDeMetadados.set(caminho, novaConsulta);
  return novaConsulta;
}

async function hidratarMetadadosDoArquivo(): Promise<void> {
  if (!firebaseEstaConfigurado || !processo.value) return;
  const alvo = processo.value;
  const caminho = alvo.caminhoNoServidor;

  try {
    const metadados = await consultarMetadadosDoArquivo(caminho);
    if (alvo.caminhoNoServidor !== caminho) return;
    alvo.tamanhoEmBytes = metadados.tamanhoEmBytes;
    alvo.modificadoEm = metadados.modificadoEm;
  } catch (falha) {
    // Ausência de mtime continua visível como “Não informado pelo servidor”.
    if (falha instanceof ErroServidorNaoConfigurado) notificar(falha.message, "error");
  }
}

function extensaoPermitePreviaDeImagem(extensao: string): boolean {
  return [".jpg", ".jpeg", ".png"].includes(extensao.toLocaleLowerCase("pt-BR"));
}

function limparPrevia(): void {
  if (urlTemporariaDaPrevia) URL.revokeObjectURL(urlTemporariaDaPrevia);
  urlTemporariaDaPrevia = "";
  urlDaPrevia.value = "";
}

async function carregarPreviaDoArquivo(): Promise<void> {
  const alvo = processo.value;
  const versaoAtual = ++versaoDoCarregamentoDaPrevia;
  limparPrevia();
  erroDaPrevia.value = "";

  if (!alvo || !extensaoPermitePreviaDeImagem(alvo.extensao)) {
    carregandoPrevia.value = false;
    return;
  }
  if (!firebaseEstaConfigurado) {
    carregandoPrevia.value = false;
    return;
  }

  carregandoPrevia.value = true;
  try {
    const imagem = await servidorDeArquivos.baixarArquivo(alvo.caminhoNoServidor);
    if (imagem.type && !imagem.type.startsWith("image/")) {
      throw new Error("O servidor não retornou um arquivo de imagem válido.");
    }
    const url = URL.createObjectURL(imagem);
    if (versaoAtual !== versaoDoCarregamentoDaPrevia) {
      URL.revokeObjectURL(url);
      return;
    }
    urlTemporariaDaPrevia = url;
    urlDaPrevia.value = url;
  } catch (falha) {
    if (versaoAtual !== versaoDoCarregamentoDaPrevia) return;
    erroDaPrevia.value =
      falha instanceof Error ? falha.message : "Não foi possível carregar a prévia do arquivo.";
    notificar(erroDaPrevia.value, "error");
  } finally {
    if (versaoAtual === versaoDoCarregamentoDaPrevia) carregandoPrevia.value = false;
  }
}

function informarFalhaDaPrevia(): void {
  limparPrevia();
  erroDaPrevia.value = "A imagem baixada não pôde ser exibida.";
}

function iniciarObservacao(): void {
  cancelarObservacao?.();
  if (!firebaseEstaConfigurado || !ordem.value) return;
  cancelarObservacaoDaOrdem?.();
  cancelarObservacaoDaOrdem = repositorioDeOrdens.observarOrdem(id.value, (novaOrdem) => {
    if (novaOrdem && ordem.value) {
      ordem.value.status = novaOrdem.status;
      ordem.value.registroMaisRecente = novaOrdem.registroMaisRecente;
    }
  });
  cancelarObservacao = repositorioDeOrdens.observarProcesso(id.value, tipo.value, (novo) => {
    if (!novo || !processo.value) return;
    const caminhoFoiAlterado = processo.value.caminhoNoServidor !== novo.arquivo.caminhoNoServidor;
    Object.assign(processo.value, {
      unidadesProduzidas: novo.unidadesProduzidas,
      metaDeUnidades: novo.metaDeUnidades,
      nomeArquivo: novo.arquivo.nomeOriginal,
      extensao: novo.arquivo.extensao,
      tamanhoEmBytes: novo.arquivo.tamanhoEmBytes,
      modificadoEmPersistido: novo.arquivo.modificadoEm,
      caminhoNoServidor: novo.arquivo.caminhoNoServidor,
      ...(caminhoFoiAlterado ? { modificadoEm: novo.arquivo.modificadoEm } : {}),
    });
    if (caminhoFoiAlterado) void hidratarMetadadosDoArquivo();
  });
}

onMounted(async () => {
  try {
    await dados.carregar();
  } catch {
    return;
  }
  iniciarObservacao();
  await hidratarMetadadosDoArquivo();
});
watch(tipo, () => {
  quantidadeDeUnidades.value = 1;
  iniciarObservacao();
  void hidratarMetadadosDoArquivo();
});
watch(
  [() => processo.value?.caminhoNoServidor, () => processo.value?.extensao],
  () => void carregarPreviaDoArquivo(),
  { immediate: true },
);
onUnmounted(() => {
  cancelarObservacao?.();
  cancelarObservacaoDaOrdem?.();
  versaoDoCarregamentoDaPrevia += 1;
  limparPrevia();
});

async function baixarArquivo(): Promise<void> {
  if (!processo.value || (porcentagemDownload.value !== null && porcentagemDownload.value < 100)) {
    return;
  }
  porcentagemDownload.value = 0;
  try {
    const alvo = processo.value;
    const blob = await servidorDeArquivos.baixarArquivo(alvo.caminhoNoServidor, (valor) => {
      porcentagemDownload.value = valor;
      notificar(`Download: ${valor}%`, valor === 100 ? "success" : "blue", 1_200);
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = alvo.nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);
    porcentagemDownload.value = 100;
    notificar("Download: 100%", "success", 1_200);
  } catch (falha) {
    porcentagemDownload.value = null;
    notificar(falha instanceof Error ? falha.message : "Falha no download.", "error");
  }
}

async function ajustar(
  tipoContador: TipoContadorProducao,
  sentido: SentidoDoAjuste,
  quantidadeDoAjuste = 1,
): Promise<void> {
  if (!ordem.value || !processo.value || !sessao.usuarioAtual.value || ajustando.value) return;
  if (ordem.value.status === StatusOrdemDeServico.CONCLUIDA) {
    notificar("Uma OS concluída não aceita produção.", "error");
    return;
  }
  if (sentido === SentidoDoAjuste.ADICIONAR && processoAtingiuMeta.value) {
    notificar("Este processo já atingiu 100%. Não é possível adicionar mais produção.", "warning");
    return;
  }
  let variacao: number;
  try {
    variacao = calcularVariacaoEmUnidades(
      tipoContador,
      sentido,
      ordem.value.unidadesPorGrade,
      quantidadeDoAjuste,
    );
  } catch (erro) {
    notificar(erro instanceof Error ? erro.message : "Informe uma quantidade válida.", "error");
    return;
  }
  ajustando.value = true;
  if (!firebaseEstaConfigurado) {
    if (processo.value.unidadesProduzidas + variacao < 0) {
      notificar("A produção não pode ficar negativa.", "error");
      ajustando.value = false;
      return;
    }
    processo.value.unidadesProduzidas += variacao;
    const linha = criarLinhaDeAjuste({
      idDaOperacao: crypto.randomUUID(),
      nomeDoUsuario: sessao.usuarioAtual.value.nome,
      processo: processo.value.tipo,
      tipoContador,
      sentido,
      variacaoEmUnidades: variacao,
    });
    acrescentarRegistroDemonstrativo(ordem.value.id, linha);
    ordem.value.registroMaisRecente = linha;
    ordem.value.status =
      processo.value.unidadesProduzidas >= processo.value.metaDeUnidades &&
      ordem.value.processos.every(
        (item) => item === processo.value || item.unidadesProduzidas >= item.metaDeUnidades,
      )
        ? StatusOrdemDeServico.CONCLUIDA
        : StatusOrdemDeServico.EM_PRODUCAO;
    notificar(`${variacao > 0 ? "+" : ""}${variacao} unidades em ${processo.value.tipo}.`, "blue");
    ajustando.value = false;
    return;
  }
  try {
    const resultado = await casosDeUso.ajustarContador.executar(
      {
        idDaOperacao: crypto.randomUUID(),
        idDaOrdem: id.value,
        tipoProcesso: tipo.value,
        tipoContador,
        sentido,
        quantidadeDoAjuste,
        referenciaUsuario: repositorioDeUsuarios.referencia(sessao.usuarioAtual.value.id),
      },
      ordem.value.caminhoRegistro,
      sessao.usuarioAtual.value.nome,
    );
    notificar(
      resultado.aviso ??
        `${resultado.variacaoEmUnidades > 0 ? "+" : ""}${resultado.variacaoEmUnidades} unidades registradas.`,
      resultado.aviso ? "warning" : "blue",
    );
  } catch (erro) {
    const mensagem =
      erro instanceof ErroServidorNaoConfigurado
        ? erro.message
        : erro instanceof Error
          ? `${erro.message} Aguarde a atualização em tempo real antes de tentar novamente.`
          : "Não foi possível confirmar o ajuste. Aguarde a atualização em tempo real antes de tentar novamente.";
    notificar(mensagem, "error");
  } finally {
    ajustando.value = false;
  }
}
</script>

<template>
  <main v-if="ordem && processo" class="page-shell">
    <AppHeader
      :titulo="rotuloDoProcesso(processo.tipo)"
      :voltar-para="preservandoRetorno({ name: 'detalhesOrdem', params: { id } })"
      rotulo-voltar="Detalhes"
    >
      <template #acoes>
        <p v-if="sessao.usuarioAtual.value" class="app-header__user muted">
          {{ sessao.usuarioAtual.value.nome }} ·
          {{ ROTULOS_CARGOS[sessao.usuarioAtual.value.cargo] }}
        </p>
      </template>
    </AppHeader>
    <nav class="stage-tabs" aria-label="Processo atual">
      <RouterLink
        v-for="item in ordem.processos"
        :key="item.tipo"
        class="stage-tab"
        :class="{ 'is-active': item.tipo === processo.tipo }"
        :aria-current="item.tipo === processo.tipo ? 'page' : undefined"
        :to="
          preservandoRetorno({
            name: 'execucaoProcesso',
            params: { id, processo: item.tipo.toLowerCase() },
          })
        "
        >{{ rotuloDoProcesso(item.tipo) }}</RouterLink
      >
    </nav>
    <section class="process-layout">
      <div>
        <section class="card">
          <h1>Produção de {{ rotuloDoProcesso(processo.tipo).toLocaleLowerCase("pt-BR") }}</h1>
          <MedidorCircular
            :valor="processo.unidadesProduzidas"
            :maximo="processo.metaDeUnidades"
            unidade="unidades"
          />
          <BarraDeProgresso :valor="progresso" />
          <p class="muted">
            Equivalência: {{ gradesCompletas }}
            {{ gradesCompletas === 1 ? "grade completa" : "grades completas" }} e
            {{ unidadesRestantes }} {{ unidadesRestantes === 1 ? "unidade" : "unidades" }}.
          </p>
        </section>
        <section v-if="podeAjustarProducao" class="card">
          <h2>Ajustar produção</h2>
          <p
            v-if="processoAtingiuMeta || ordemConcluida"
            class="status-symbol status-symbol--CONCLUIDA"
          >
            {{
              ordemConcluida
                ? "OS concluída. Os contadores estão bloqueados."
                : "Meta atingida. Adições estão bloqueadas; correções por remoção continuam disponíveis."
            }}
          </p>
          <div class="production-adjustment">
            <section class="adjustment-group" aria-labelledby="grade-adjustment-title">
              <h3 id="grade-adjustment-title">Grades</h3>
              <MedidorCircular
                v-if="medidores"
                :valor="medidores.gradesProduzidas"
                :maximo="medidores.gradesNecessarias"
                unidade="grades"
              />
              <p v-if="medidores" class="muted">
                Faltam {{ medidores.gradesFaltantes.toLocaleString("pt-BR") }}
                {{ medidores.gradesFaltantes === 1 ? "grade" : "grades" }}.
              </p>
              <p class="muted">Uma grade equivale a {{ ordem.unidadesPorGrade }} unidades.</p>
              <div class="button-row">
                <button
                  class="btn btn--secondary"
                  :disabled="ajustando || ordemConcluida"
                  @click="ajustar(TipoContadorProducao.GRADE, SentidoDoAjuste.REMOVER)"
                >
                  −1 grade</button
                ><button
                  class="btn btn--primary"
                  :disabled="ajustando || processoAtingiuMeta || ordemConcluida"
                  @click="ajustar(TipoContadorProducao.GRADE, SentidoDoAjuste.ADICIONAR)"
                >
                  +1 grade
                </button>
              </div>
            </section>
            <section class="adjustment-group" aria-labelledby="unit-adjustment-title">
              <h3 id="unit-adjustment-title">Unidades</h3>
              <MedidorCircular
                v-if="medidores"
                :valor="medidores.unidadesProduzidas"
                :maximo="medidores.quantidadeTotal"
                unidade="unidades"
              />
              <p v-if="medidores" class="muted">
                Faltam {{ medidores.unidadesFaltantes.toLocaleString("pt-BR") }}
                {{ medidores.unidadesFaltantes === 1 ? "unidade" : "unidades" }}.
              </p>
              <div class="field">
                <label for="unit-adjustment-quantity">Quantidade de unidades</label>
                <input
                  id="unit-adjustment-quantity"
                  v-model.number="quantidadeDeUnidades"
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  :disabled="ordemConcluida"
                  :aria-invalid="!quantidadeDeUnidadesValida"
                />
                <p v-if="!quantidadeDeUnidadesValida" class="field__error" role="alert">
                  Informe um número inteiro maior que zero.
                </p>
              </div>
              <div class="button-row">
                <button
                  class="btn btn--secondary"
                  :disabled="ajustando || !quantidadeDeUnidadesValida || ordemConcluida"
                  @click="
                    ajustar(
                      TipoContadorProducao.UNIDADE,
                      SentidoDoAjuste.REMOVER,
                      Number(quantidadeDeUnidades),
                    )
                  "
                >
                  Remover unidades</button
                ><button
                  class="btn btn--primary"
                  :disabled="
                    ajustando ||
                    !quantidadeDeUnidadesValida ||
                    processoAtingiuMeta ||
                    ordemConcluida
                  "
                  @click="
                    ajustar(
                      TipoContadorProducao.UNIDADE,
                      SentidoDoAjuste.ADICIONAR,
                      Number(quantidadeDeUnidades),
                    )
                  "
                >
                  Adicionar unidades
                </button>
              </div>
            </section>
          </div>
        </section>
        <section v-else class="card" aria-labelledby="read-only-production-title">
          <h2 id="read-only-production-title">Acompanhamento da produção</h2>
          <p class="muted">
            Seu cargo pode consultar o progresso e o arquivo designado, mas não possui autorização
            para ajustar a produção.
          </p>
        </section>
        <section class="card">
          <div class="section-heading">
            <h2>Atividade recente</h2>
            <RouterLink
              class="btn btn--small btn--secondary"
              :to="preservandoRetorno({ name: 'registrosOrdem', params: { id } })"
              >Abrir registros</RouterLink
            >
          </div>
          <ul class="activity-list" aria-live="polite">
            <li v-if="ordem.registroMaisRecente" class="mono">
              {{ ordem.registroMaisRecente }}
            </li>
            <li v-else>Nenhuma atividade registrada.</li>
          </ul>
        </section>
      </div>
      <PreviewDeArquivo
        titulo="Arquivo designado"
        :nome="processo.nomeArquivo"
        :extensao="processo.extensao"
        :processo="processo.tipo"
        :dimensoes-da-grade="`${ordem.larguraGrade} × ${ordem.alturaGrade} cm`"
        :tamanho-em-bytes="processo.tamanhoEmBytes"
        :modificado-em="processo.modificadoEm"
        :caminho="processo.caminhoNoServidor"
        :url-da-previa="urlDaPrevia"
        :carregando-previa="carregandoPrevia"
        :erro-da-previa="erroDaPrevia"
        :descricao="`Arquivo exclusivo da etapa de ${rotuloDoProcesso(processo.tipo)}. Os ajustes desta tela afetam somente este processo.`"
        @falha-na-previa="informarFalhaDaPrevia"
      >
        <template #acoes>
          <button
            class="btn btn--primary"
            :disabled="porcentagemDownload !== null && porcentagemDownload < 100"
            @click="baixarArquivo"
          >
            {{
              porcentagemDownload === null
                ? "Baixar arquivo"
                : porcentagemDownload < 100
                  ? `Baixando: ${porcentagemDownload}%`
                  : "Baixar novamente (100%)"
            }}
          </button>
        </template>
      </PreviewDeArquivo>
    </section>
    <IdentificadorDaPagina rotulo="ID da Ordem de Serviço" :valor="id" />
  </main>
  <main v-else-if="dados.erro.value" class="page-shell">
    <p class="state-message state-message--error" role="alert">
      {{ dados.erro.value.message }}
    </p>
  </main>
  <main v-else-if="dados.carregando.value || !dados.carregado.value" class="page-shell">
    <p class="state-message">Carregando processo...</p>
  </main>
  <main v-else class="page-shell">
    <p class="state-message">Este processo não está habilitado para a OS.</p>
  </main>
</template>
