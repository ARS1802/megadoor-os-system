<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppHeader from "@/componentes/AppHeader.vue";
import AppPopup from "@/componentes/AppPopup.vue";
import BarraDeProgresso from "@/componentes/BarraDeProgresso.vue";
import IdentificadorDaPagina from "@/componentes/IdentificadorDaPagina.vue";
import TabelaDeDados, { type ColunaTabela } from "@/componentes/TabelaDeDados.vue";
import PreviewDeArquivo from "@/componentes/PreviewDeArquivo.vue";
import {
  CargoUsuario,
  ROTULOS_STATUS_ORDEM,
  StatusOrdemDeServico,
  TipoProcessoProducao,
  rotuloDoProcesso,
} from "@/dominio/enumeracoes";
import { usarDados } from "@/composables/usarDados";
import { usarSessao } from "@/composables/usarSessao";
import { usarNotificacoes } from "@/composables/usarNotificacoes";
import { usarNavegacaoContextual } from "@/composables/usarNavegacaoContextual";
import { firebaseEstaConfigurado } from "@/infraestrutura/firebase/configuracaoFirebase";
import {
  criarLinhaDeConclusaoForcada,
  criarLinhaDeSubstituicaoDeArquivo,
} from "@/aplicacao/servicos/registrosDaOrdem";
import { acrescentarRegistroDemonstrativo } from "@/infraestrutura/demonstracao/registrosDemonstrativos";
import {
  extensoesPermitidasParaProcesso,
  validarArquivoDoProcesso,
} from "@/aplicacao/servicos/validacaoDeArquivoDoProcesso";
import {
  casosDeUso,
  repositorioDeOrdens,
  repositorioDeUsuarios,
  servidorDeArquivos,
} from "@/infraestrutura/servicosDaAplicacao";

const rota = useRoute();
const roteador = useRouter();
const dados = usarDados();
const sessao = usarSessao();
const { notificar } = usarNotificacoes();
const { destinoDeRetorno, preservandoRetorno } = usarNavegacaoContextual();
const observacao = ref("");
const carregandoObservacao = ref(true);
const arquivoSelecionado = ref(0);
const tipoSelecionadoParaReupload = ref<TipoProcessoProducao | null>(null);
const seletorDeReupload = ref<HTMLInputElement | null>(null);
const reenviandoArquivo = ref(false);
const erroDoReupload = ref("");
const porcentagemDownload = ref<number | null>(null);
const popupConclusao = ref(false);
const popupEtiqueta = ref(false);
const carregandoEtiqueta = ref(false);
const urlDaEtiqueta = ref("");
const erroDaEtiqueta = ref("");
const justificativa = ref("");
const id = computed(() => String(rota.params.id));
const ordem = computed(() => dados.ordens.value.find((item) => item.id === id.value));
const processos = computed(() => ordem.value?.processos ?? []);
const arquivo = computed(() => processos.value[arquivoSelecionado.value]);
const arquivoSelecionadoParaReupload = computed(() =>
  processos.value.find((item) => item.tipo === tipoSelecionadoParaReupload.value),
);
const podeReenviarArquivo = computed(() =>
  Boolean(
    ordem.value?.status !== StatusOrdemDeServico.CONCLUIDA &&
    [CargoUsuario.ADMIN, CargoUsuario.DESIGNER].includes(
      sessao.usuarioAtual.value?.cargo as CargoUsuario,
    ),
  ),
);
const extensoesDoReupload = computed(() =>
  arquivoSelecionadoParaReupload.value
    ? extensoesPermitidasParaProcesso(arquivoSelecionadoParaReupload.value.tipo).join(",")
    : "",
);
const colunas: ColunaTabela[] = [
  { chave: "nomeArquivo", rotulo: "Arquivo" },
  { chave: "extensao", rotulo: "Tipo" },
  { chave: "tipo", rotulo: "Processo" },
  { chave: "unidadesProduzidas", rotulo: "Produzidas", alinhamento: "right" },
];
let urlTemporariaDaEtiqueta = "";
let versaoDoCarregamentoDaEtiqueta = 0;
let versaoDoCarregamentoDaObservacao = 0;
const cancelarObservacoesDosProcessos: (() => void)[] = [];
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

async function hidratarMetadadosDoArquivo(processo = arquivo.value): Promise<void> {
  if (!firebaseEstaConfigurado || !processo) return;
  const caminho = processo.caminhoNoServidor;

  try {
    const metadados = await consultarMetadadosDoArquivo(caminho);
    if (processo.caminhoNoServidor !== caminho) return;
    processo.tamanhoEmBytes = metadados.tamanhoEmBytes;
    processo.modificadoEm = metadados.modificadoEm;
  } catch {
    // O Preview mantém “Não informado pelo servidor”; não inventamos uma data local.
  }
}

async function carregarObservacaoDaOrdem(
  caminho: string,
  observacaoDemonstrativa?: string,
): Promise<void> {
  const versaoAtual = ++versaoDoCarregamentoDaObservacao;
  carregandoObservacao.value = true;

  try {
    const texto = firebaseEstaConfigurado
      ? await servidorDeArquivos.lerTexto(caminho)
      : (observacaoDemonstrativa ?? "");
    if (versaoAtual === versaoDoCarregamentoDaObservacao) observacao.value = texto;
  } catch {
    if (versaoAtual !== versaoDoCarregamentoDaObservacao) return;
    observacao.value = "";
    notificar("Não foi possível carregar observacao.txt.", "error");
  } finally {
    if (versaoAtual === versaoDoCarregamentoDaObservacao) {
      carregandoObservacao.value = false;
    }
  }
}

watch(
  [() => ordem.value?.caminhoObservacao, () => ordem.value?.observacaoDemonstrativa],
  ([caminho, observacaoDemonstrativa]) => {
    if (!caminho) {
      versaoDoCarregamentoDaObservacao += 1;
      observacao.value = "";
      return;
    }
    void carregarObservacaoDaOrdem(caminho, observacaoDemonstrativa);
  },
  { immediate: true },
);

onMounted(async () => {
  try {
    await dados.carregar();
  } catch {
    return;
  }
  if (!ordem.value) return;
  if (firebaseEstaConfigurado) {
    for (const processoAtual of processos.value) {
      cancelarObservacoesDosProcessos.push(
        repositorioDeOrdens.observarProcesso(
          id.value,
          processoAtual.tipo,
          (novo) => {
            if (!novo) return;
            const alvo = processos.value.find((item) => item.tipo === novo.tipo);
            if (!alvo) return;
            const caminhoFoiAlterado = alvo.caminhoNoServidor !== novo.arquivo.caminhoNoServidor;
            Object.assign(alvo, {
              unidadesProduzidas: novo.unidadesProduzidas,
              metaDeUnidades: novo.metaDeUnidades,
              nomeArquivo: novo.arquivo.nomeOriginal,
              extensao: novo.arquivo.extensao,
              tamanhoEmBytes: novo.arquivo.tamanhoEmBytes,
              caminhoNoServidor: novo.arquivo.caminhoNoServidor,
              modificadoEmPersistido: novo.arquivo.modificadoEm,
              ...(caminhoFoiAlterado ? { modificadoEm: novo.arquivo.modificadoEm } : {}),
            });
            if (caminhoFoiAlterado) void hidratarMetadadosDoArquivo(alvo);
          },
          (falha) => notificar(falha.message, "error"),
        ),
      );
    }
  }
  await Promise.all(processos.value.map((processo) => hidratarMetadadosDoArquivo(processo)));
});

onBeforeUnmount(() => {
  cancelarObservacoesDosProcessos.splice(0).forEach((cancelar) => cancelar());
  versaoDoCarregamentoDaEtiqueta += 1;
  versaoDoCarregamentoDaObservacao += 1;
  if (urlTemporariaDaEtiqueta) URL.revokeObjectURL(urlTemporariaDaEtiqueta);
});

function limparUrlTemporariaDaEtiqueta(): void {
  if (urlTemporariaDaEtiqueta) URL.revokeObjectURL(urlTemporariaDaEtiqueta);
  urlTemporariaDaEtiqueta = "";
  urlDaEtiqueta.value = "";
}

async function abrirEtiquetaDoMaterial(): Promise<void> {
  const caminho = ordem.value?.caminhoImagemEtiquetaDoMaterial;
  if (!caminho) return;

  const versaoAtual = ++versaoDoCarregamentoDaEtiqueta;
  limparUrlTemporariaDaEtiqueta();
  erroDaEtiqueta.value = "";
  carregandoEtiqueta.value = true;
  popupEtiqueta.value = true;

  try {
    if (firebaseEstaConfigurado) {
      const imagem = await servidorDeArquivos.baixarArquivo(caminho);
      const url = URL.createObjectURL(imagem);
      if (versaoAtual !== versaoDoCarregamentoDaEtiqueta) {
        URL.revokeObjectURL(url);
        return;
      }
      urlTemporariaDaEtiqueta = url;
      urlDaEtiqueta.value = url;
    } else {
      urlDaEtiqueta.value = caminho;
    }
  } catch (falha) {
    if (versaoAtual !== versaoDoCarregamentoDaEtiqueta) return;
    erroDaEtiqueta.value =
      falha instanceof Error ? falha.message : "Não foi possível carregar a etiqueta.";
    notificar(erroDaEtiqueta.value, "error");
  } finally {
    if (versaoAtual === versaoDoCarregamentoDaEtiqueta) carregandoEtiqueta.value = false;
  }
}

function fecharEtiquetaDoMaterial(): void {
  versaoDoCarregamentoDaEtiqueta += 1;
  popupEtiqueta.value = false;
  carregandoEtiqueta.value = false;
  erroDaEtiqueta.value = "";
  limparUrlTemporariaDaEtiqueta();
}

function informarFalhaDaImagem(): void {
  urlDaEtiqueta.value = "";
  erroDaEtiqueta.value = "O arquivo da etiqueta não pôde ser exibido como imagem.";
}

function progresso(processo: { unidadesProduzidas: number; metaDeUnidades: number }): number {
  return (processo.unidadesProduzidas / processo.metaDeUnidades) * 100;
}

function selecionarArquivo(linha: Record<string, unknown>): void {
  const indice = processos.value.findIndex((item) => item.tipo === linha.tipo);
  if (indice < 0) return;
  arquivoSelecionado.value = indice;
  tipoSelecionadoParaReupload.value = processos.value[indice].tipo;
  erroDoReupload.value = "";
  void hidratarMetadadosDoArquivo(processos.value[indice]);
}

async function abrirSeletorDeReupload(): Promise<void> {
  if (!arquivoSelecionadoParaReupload.value || reenviandoArquivo.value) return;
  erroDoReupload.value = "";
  await nextTick();
  seletorDeReupload.value?.click();
}

async function aoEscolherArquivoParaReupload(evento: Event): Promise<void> {
  const entrada = evento.target as HTMLInputElement;
  const novoArquivo = entrada.files?.[0];
  const anterior = arquivoSelecionadoParaReupload.value;
  entrada.value = "";
  if (!novoArquivo || !anterior || !ordem.value || !sessao.usuarioAtual.value) return;

  const erroDeValidacao = validarArquivoDoProcesso(anterior.tipo, novoArquivo);
  if (erroDeValidacao) {
    erroDoReupload.value = erroDeValidacao;
    notificar(erroDeValidacao, "error");
    return;
  }

  erroDoReupload.value = "";
  reenviandoArquivo.value = true;
  try {
    if (firebaseEstaConfigurado) {
      const resultado = await casosDeUso.reenviarArquivo.executar({
        idDaOrdem: ordem.value.id,
        tipoProcesso: anterior.tipo,
        arquivoAnteriorEsperado: {
          caminhoNoServidor: anterior.caminhoNoServidor,
          modificadoEm: anterior.modificadoEmPersistido,
        },
        novoArquivo,
        usuarioResponsavel: sessao.usuarioAtual.value,
        caminhoRegistro: ordem.value.caminhoRegistro,
      });
      Object.assign(anterior, {
        nomeArquivo: resultado.arquivoNovo.nomeOriginal,
        extensao: resultado.arquivoNovo.extensao,
        tamanhoEmBytes: resultado.arquivoNovo.tamanhoEmBytes,
        caminhoNoServidor: resultado.arquivoNovo.caminhoNoServidor,
        modificadoEm: resultado.arquivoNovo.modificadoEm,
        modificadoEmPersistido: resultado.arquivoNovo.modificadoEm,
      });
      consultasDeMetadados.set(
        resultado.arquivoNovo.caminhoNoServidor,
        Promise.resolve({
          nome: resultado.arquivoNovo.nomeOriginal,
          caminhoNoServidor: resultado.arquivoNovo.caminhoNoServidor,
          tamanhoEmBytes: resultado.arquivoNovo.tamanhoEmBytes,
          modificadoEm: resultado.arquivoNovo.modificadoEm,
        }),
      );
      notificar(
        resultado.aviso ?? `Arquivo de ${rotuloDoProcesso(anterior.tipo)} substituído.`,
        resultado.aviso ? "warning" : "success",
      );
      return;
    }

    const caminhoAnterior = anterior.caminhoNoServidor;
    const nomeAnterior = anterior.nomeArquivo;
    const caminhoNovo = `${caminhoAnterior.slice(0, caminhoAnterior.lastIndexOf("/") + 1)}${novoArquivo.name}`;
    const modificadoEm = new Date();
    acrescentarRegistroDemonstrativo(
      ordem.value.id,
      criarLinhaDeSubstituicaoDeArquivo({
        idDaOperacao: crypto.randomUUID(),
        nomeDoUsuario: sessao.usuarioAtual.value.nome,
        processo: anterior.tipo,
        nomeDoArquivoAnterior: nomeAnterior,
        caminhoDoArquivoAnterior: caminhoAnterior,
        nomeDoArquivoNovo: novoArquivo.name,
        caminhoDoArquivoNovo: caminhoNovo,
      }),
    );
    const pontoDaExtensao = novoArquivo.name.lastIndexOf(".");
    Object.assign(anterior, {
      nomeArquivo: novoArquivo.name,
      extensao: pontoDaExtensao >= 0 ? novoArquivo.name.slice(pontoDaExtensao).toLowerCase() : "",
      tamanhoEmBytes: novoArquivo.size,
      caminhoNoServidor: caminhoNovo,
      modificadoEm,
      modificadoEmPersistido: modificadoEm,
    });
    notificar(
      `Arquivo de ${rotuloDoProcesso(anterior.tipo)} substituído no modo demonstrativo.`,
      "success",
    );
  } catch (falha) {
    erroDoReupload.value =
      falha instanceof Error ? falha.message : "Não foi possível substituir o arquivo.";
    notificar(erroDoReupload.value, "error");
  } finally {
    reenviandoArquivo.value = false;
  }
}

async function baixar(): Promise<void> {
  if (!arquivo.value || (porcentagemDownload.value !== null && porcentagemDownload.value < 100))
    return;
  porcentagemDownload.value = 0;
  try {
    const blob = await servidorDeArquivos.baixarArquivo(
      arquivo.value.caminhoNoServidor,
      (valor) => {
        porcentagemDownload.value = valor;
        notificar(`Download: ${valor}%`, valor === 100 ? "success" : "blue", 1200);
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = arquivo.value.nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);
    porcentagemDownload.value = 100;
  } catch (erro) {
    porcentagemDownload.value = null;
    notificar(erro instanceof Error ? erro.message : "Falha no download.", "error");
  }
}

async function forcarConclusao(): Promise<void> {
  if (!ordem.value || !sessao.usuarioAtual.value || !firebaseEstaConfigurado) {
    if (ordem.value) {
      const linha = criarLinhaDeConclusaoForcada({
        nomeDoAdministrador: sessao.usuarioAtual.value?.nome ?? "Administrador demonstrativo",
        justificativa: justificativa.value,
        resultado: {
          processos: ordem.value.processos.map((processo) => ({
            tipoProcesso: processo.tipo,
            unidadesProduzidas: processo.unidadesProduzidas,
            unidadesFaltantes: Math.max(0, processo.metaDeUnidades - processo.unidadesProduzidas),
          })),
        },
      });
      acrescentarRegistroDemonstrativo(ordem.value.id, linha);
      ordem.value.status = StatusOrdemDeServico.CONCLUIDA;
    }
    popupConclusao.value = false;
    notificar("Conclusão forçada no modo demonstrativo.", "warning");
    return;
  }
  try {
    const resultado = await casosDeUso.forcarConclusao.executar({
      idDaOrdem: ordem.value.id,
      referenciaAdministrador: repositorioDeUsuarios.referencia(sessao.usuarioAtual.value.id),
      nomeDoAdministrador: sessao.usuarioAtual.value.nome,
      justificativa: justificativa.value,
      caminhoRegistro: ordem.value.caminhoRegistro,
    });
    popupConclusao.value = false;
    notificar(
      resultado.aviso ?? "Ordem concluída pelo Administrador.",
      resultado.aviso ? "warning" : "success",
    );
    await dados.carregar();
  } catch (erro) {
    notificar(erro instanceof Error ? erro.message : "Não foi possível concluir a ordem.", "error");
  }
}
</script>

<template>
  <main v-if="ordem" class="page-shell">
    <AppHeader
      titulo="Detalhes da Ordem de Serviço"
      :voltar-para="destinoDeRetorno"
      rotulo-voltar="Ordens"
    >
      <template #acoes
        ><RouterLink
          class="header-link"
          :to="preservandoRetorno({ name: 'registrosOrdem', params: { id } })"
          >Registros</RouterLink
        ></template
      >
    </AppHeader>
    <nav class="stage-tabs" aria-label="Abrir etapa da produção">
      <RouterLink
        v-for="processo in processos"
        :key="processo.tipo"
        class="stage-tab"
        :to="
          preservandoRetorno({
            name: 'execucaoProcesso',
            params: { id, processo: processo.tipo.toLowerCase() },
          })
        "
        >{{ rotuloDoProcesso(processo.tipo) }}</RouterLink
      >
    </nav>
    <section class="details-grid">
      <div class="details-main">
        <section class="card">
          <h1>Informações da Ordem de Serviço</h1>
          <div class="order-data-columns">
            <section class="order-data-column" aria-labelledby="main-data-title">
              <h2 id="main-data-title">Dados principais</h2>
              <dl class="order-data-list">
                <div>
                  <dt>Nome do candidato</dt>
                  <dd>{{ ordem.nomeDoCandidato }}</dd>
                </div>
                <div>
                  <dt>Tamanho da unidade</dt>
                  <dd>{{ ordem.dimensoesDaUnidade }}</dd>
                </div>
                <div>
                  <dt>Nome do material</dt>
                  <dd>
                    <a
                      v-if="ordem.caminhoImagemEtiquetaDoMaterial"
                      class="material-label-link"
                      href="#popup-etiqueta-material"
                      aria-haspopup="dialog"
                      aria-controls="popup-etiqueta-material"
                      @click.prevent="abrirEtiquetaDoMaterial"
                      >{{ ordem.nomeDoMaterial }}</a
                    ><span v-else>{{ ordem.nomeDoMaterial }}</span>
                  </dd>
                </div>
                <div>
                  <dt>Quantidade total</dt>
                  <dd>{{ ordem.quantidadeTotal.toLocaleString("pt-BR") }}</dd>
                </div>
                <div>
                  <dt>Unidades por grade</dt>
                  <dd>{{ ordem.unidadesPorGrade.toLocaleString("pt-BR") }}</dd>
                </div>
              </dl>
            </section>
            <section class="order-data-column" aria-labelledby="campaign-data-title">
              <h2 id="campaign-data-title">Campanha</h2>
              <dl class="order-data-list">
                <div>
                  <dt>Partido</dt>
                  <dd>{{ ordem.partidoDoCandidato ?? "Não informado" }}</dd>
                </div>
                <div>
                  <dt>Tiragem</dt>
                  <dd>{{ ordem.tiragem.toLocaleString("pt-BR") }}</dd>
                </div>
                <div>
                  <dt>CNPJ</dt>
                  <dd>{{ ordem.cnpjDoCandidato ?? "Não informado" }}</dd>
                </div>
              </dl>
            </section>
          </div>
        </section>
        <section class="card">
          <div class="section-heading">
            <h2>Estado atual da OS</h2>
            <button
              v-if="
                sessao.usuarioAtual.value?.cargo === CargoUsuario.ADMIN &&
                [StatusOrdemDeServico.EM_PRODUCAO, StatusOrdemDeServico.PARADA].includes(
                  ordem.status,
                )
              "
              class="btn btn--danger btn--small"
              @click="popupConclusao = true"
            >
              Forçar conclusão
            </button>
          </div>
          <p class="status-symbol" :class="`status-symbol--${ordem.status}`">
            {{ ROTULOS_STATUS_ORDEM[ordem.status] }}
          </p>
        </section>
        <section class="card">
          <h2>Processos</h2>
          <div class="process-summary-grid">
            <article v-for="processo in processos" :key="processo.tipo">
              <h3>{{ rotuloDoProcesso(processo.tipo) }}</h3>
              <p>
                {{ processo.unidadesProduzidas.toLocaleString("pt-BR") }} /
                {{ processo.metaDeUnidades.toLocaleString("pt-BR") }}
              </p>
              <BarraDeProgresso :valor="progresso(processo)" />
            </article>
          </div>
        </section>
        <section class="card order-files-card">
          <div class="section-heading">
            <h2>Arquivos</h2>
            <div class="order-files-card__actions">
              <input
                ref="seletorDeReupload"
                class="visually-hidden"
                type="file"
                :accept="extensoesDoReupload"
                aria-label="Selecionar arquivo corrigido"
                @change="aoEscolherArquivoParaReupload"
              />
              <button
                v-if="podeReenviarArquivo"
                class="btn btn--small btn--primary"
                type="button"
                :disabled="!arquivoSelecionadoParaReupload || reenviandoArquivo"
                :aria-describedby="erroDoReupload ? 'reupload-file-error' : undefined"
                :title="
                  arquivoSelecionadoParaReupload
                    ? `Substituir o arquivo de ${rotuloDoProcesso(arquivoSelecionadoParaReupload.tipo)}`
                    : 'Selecione primeiro uma linha da tabela'
                "
                @click="abrirSeletorDeReupload"
              >
                {{ reenviandoArquivo ? "Reenviando..." : "Reupload" }}
              </button>
              <RouterLink
                class="btn btn--small btn--secondary"
                :to="preservandoRetorno({ name: 'registrosOrdem', params: { id } })"
                >Abrir registros</RouterLink
              >
            </div>
          </div>
          <p class="muted order-files-card__selection-help">
            Selecione uma linha para visualizar ou substituir o arquivo desse processo.
          </p>
          <p v-if="erroDoReupload" id="reupload-file-error" class="field__error" role="alert">
            {{ erroDoReupload }}
          </p>
          <TabelaDeDados
            :colunas="colunas"
            :linhas="processos.map((item) => ({ ...item, id: item.tipo }))"
            rotulo="Arquivos da Ordem de Serviço"
            @ativar-linha="selecionarArquivo"
            ><template #cell-tipo="{ valor }">{{
              rotuloDoProcesso(valor)
            }}</template></TabelaDeDados
          >
        </section>
      </div>
      <PreviewDeArquivo
        v-if="arquivo"
        id="file-preview"
        titulo="Arquivo selecionado"
        :nome="arquivo.nomeArquivo"
        :extensao="arquivo.extensao"
        :processo="arquivo.tipo"
        :dimensoes-da-grade="`${ordem.larguraGrade} × ${ordem.alturaGrade} cm`"
        :tamanho-em-bytes="arquivo.tamanhoEmBytes"
        :modificado-em="arquivo.modificadoEm"
        :caminho="arquivo.caminhoNoServidor"
        :descricao="`Arquivo destinado à etapa de ${rotuloDoProcesso(arquivo.tipo)} desta Ordem de Serviço.`"
      >
        <template #acoes>
          <button
            class="btn btn--primary"
            :disabled="porcentagemDownload !== null && porcentagemDownload < 100"
            @click="baixar"
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
    <section class="card observacao-os">
      <h2>Observação</h2>
      <p v-if="carregandoObservacao" class="muted">Carregando observação...</p>
      <p v-else-if="observacao.trim()" class="observacao-os__texto">{{ observacao }}</p>
      <p v-else class="muted">Nenhuma observação foi adicionada.</p>
    </section>
    <IdentificadorDaPagina rotulo="ID da Ordem de Serviço" :valor="id" />
    <AppPopup
      id="popup-etiqueta-material"
      :aberto="popupEtiqueta"
      :titulo="`Etiqueta do material — ${ordem.nomeDoMaterial}`"
      @fechar="fecharEtiquetaDoMaterial"
    >
      <div class="material-label-popup" aria-live="polite">
        <p v-if="carregandoEtiqueta" class="state-message">Carregando etiqueta...</p>
        <p v-else-if="erroDaEtiqueta" class="state-message state-message--error" role="alert">
          {{ erroDaEtiqueta }}
        </p>
        <img
          v-else-if="urlDaEtiqueta"
          class="material-label-popup__image"
          :src="urlDaEtiqueta"
          :alt="`Etiqueta do material ${ordem.nomeDoMaterial}`"
          @error="informarFalhaDaImagem"
        />
      </div>
    </AppPopup>
    <AppPopup :aberto="popupConclusao" titulo="Forçar conclusão" @fechar="popupConclusao = false"
      ><p>Os contadores reais serão preservados. Informe o motivo do encerramento.</p>
      <div class="field">
        <label for="justification">Justificativa</label
        ><textarea id="justification" v-model="justificativa" rows="4"></textarea>
      </div>
      <template #acoes
        ><button class="btn btn--secondary" @click="popupConclusao = false">Cancelar</button
        ><button class="btn btn--danger" :disabled="!justificativa.trim()" @click="forcarConclusao">
          Concluir OS
        </button></template
      ></AppPopup
    >
  </main>
  <main v-else-if="dados.erro.value" class="page-shell">
    <p class="state-message state-message--error" role="alert">
      {{ dados.erro.value.message }}
    </p>
    <button class="btn btn--secondary" @click="roteador.back()">Voltar</button>
  </main>
  <main v-else-if="dados.carregando.value || !dados.carregado.value" class="page-shell">
    <p class="state-message">Carregando Ordem de Serviço...</p>
  </main>
  <main v-else class="page-shell">
    <p class="state-message">Ordem de Serviço não encontrada.</p>
    <button class="btn btn--secondary" @click="roteador.back()">Voltar</button>
  </main>
</template>
