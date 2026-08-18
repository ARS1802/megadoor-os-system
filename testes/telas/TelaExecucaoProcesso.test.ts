import { flushPromises, mount, shallowMount } from "@vue/test-utils";
import { computed, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CargoUsuario, StatusOrdemDeServico, TipoProcessoProducao } from "@/dominio/enumeracoes";
import TelaExecucaoProcesso from "@/telas/ordensDeServico/TelaExecucaoProcesso.vue";

const falha = new Error("Não foi possível ler as Ordens de Serviço.");
const dependencias = vi.hoisted(() => ({
  ordens: null as unknown as Ref<Record<string, unknown>[]>,
  erro: null as unknown as Ref<Error | null>,
  carregar: vi.fn<() => Promise<void>>(),
  baixarArquivo: vi.fn<() => Promise<Blob>>(),
  obterMetadadosDoArquivo: vi.fn(),
  notificar: vi.fn(),
}));

vi.mock("@/composables/usarDados", async () => {
  const { ref } = await import("vue");
  dependencias.ordens = ref<Record<string, unknown>[]>([]);
  dependencias.erro = ref<Error | null>(null);
  return {
    usarDados: () => ({
      ordens: dependencias.ordens,
      carregar: dependencias.carregar,
      carregando: computed(() => false),
      carregado: computed(() => !dependencias.erro.value),
      erro: dependencias.erro,
    }),
  };
});

vi.mock("@/composables/usarSessao", async () => {
  const { ref } = await import("vue");
  return {
    usarSessao: () => ({
      usuarioAtual: ref({ id: "designer-1", nome: "Ana", cargo: CargoUsuario.DESIGNER }),
    }),
  };
});

vi.mock("@/composables/usarNotificacoes", () => ({
  usarNotificacoes: () => ({ notificar: dependencias.notificar }),
}));

vi.mock("@/composables/usarNavegacaoContextual", () => ({
  usarNavegacaoContextual: () => ({ preservandoRetorno: (destino: unknown) => destino }),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "OS-ERRO", processo: "impressao" } }),
}));

vi.mock("@/infraestrutura/firebase/configuracaoFirebase", () => ({
  firebaseEstaConfigurado: true,
}));

vi.mock("@/infraestrutura/servicosDaAplicacao", () => ({
  casosDeUso: { ajustarContador: { executar: vi.fn() } },
  repositorioDeOrdens: {
    observarOrdem: vi.fn(() => vi.fn()),
    observarProcesso: vi.fn(() => vi.fn()),
  },
  repositorioDeUsuarios: { referencia: vi.fn() },
  servidorDeArquivos: {
    obterMetadadosDoArquivo: dependencias.obterMetadadosDoArquivo,
    baixarArquivo: dependencias.baixarArquivo,
  },
}));

function ordemComImagem(): Record<string, unknown> {
  return {
    id: "OS-ERRO",
    candidatoId: "candidato-1",
    materialId: "material-1",
    nomeDoCandidato: "Candidato",
    nomeDoMaterial: "Material",
    dimensoesDaUnidade: "10 × 20 cm",
    larguraDaUnidadeEmCentimetros: 10,
    alturaDaUnidadeEmCentimetros: 20,
    larguraGrade: 100,
    alturaGrade: 200,
    unidadesPorGrade: 7,
    quantidadeTotal: 30,
    tiragem: 1,
    status: StatusOrdemDeServico.EM_PRODUCAO,
    processos: [
      {
        tipo: TipoProcessoProducao.IMPRESSAO,
        unidadesProduzidas: 28,
        metaDeUnidades: 30,
        nomeArquivo: "arte.png",
        extensao: ".png",
        tamanhoEmBytes: 4,
        caminhoNoServidor: "ordens-de-servico/OS-ERRO/impressao/arte.png",
        modificadoEm: new Date("2026-08-18T12:00:00-03:00"),
      },
    ],
    caminhoRegistro: "ordens-de-servico/OS-ERRO/registro.txt",
    registroMaisRecente: "",
    caminhoObservacao: "ordens-de-servico/OS-ERRO/observacao.txt",
    criadaEm: new Date("2026-08-18T12:00:00-03:00"),
  };
}

describe("tela de execução de processo", () => {
  beforeEach(() => {
    dependencias.ordens.value = [];
    dependencias.erro.value = null;
    dependencias.carregar.mockReset().mockResolvedValue(undefined);
    dependencias.baixarArquivo.mockReset();
    dependencias.obterMetadadosDoArquivo.mockReset().mockResolvedValue({
      tamanhoEmBytes: 4,
      modificadoEm: new Date("2026-08-18T12:00:00-03:00"),
    });
    dependencias.notificar.mockClear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:previa-da-imagem"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("exibe a falha dos dados em vez de manter o carregamento indefinidamente", async () => {
    dependencias.erro.value = falha;
    dependencias.carregar.mockRejectedValue(falha);
    const wrapper = shallowMount(TelaExecucaoProcesso, {
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(falha.message);
    expect(wrapper.text()).not.toContain("Carregando processo");
  });

  it("simula o download de uma imagem e a mostra dentro do card de prévia", async () => {
    dependencias.ordens.value = [ordemComImagem()];
    dependencias.baixarArquivo.mockResolvedValue(
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    );

    const wrapper = mount(TelaExecucaoProcesso, {
      global: {
        stubs: {
          AppHeader: true,
          BarraDeProgresso: true,
          IdentificadorDaPagina: true,
          RouterLink: true,
        },
      },
    });
    await flushPromises();

    expect(dependencias.baixarArquivo).toHaveBeenCalledWith(
      "ordens-de-servico/OS-ERRO/impressao/arte.png",
    );
    const previa = wrapper.get(".file-preview-card");
    expect(previa.get(".file-preview__image").attributes("src")).toBe("blob:previa-da-imagem");
    expect(previa.get("button").text()).toBe("Baixar arquivo");
  });

  it("mostra nome e cargo do usuário à direita do cabeçalho", async () => {
    dependencias.ordens.value = [ordemComImagem()];
    dependencias.baixarArquivo.mockResolvedValue(new Blob([], { type: "image/png" }));

    const wrapper = mount(TelaExecucaoProcesso, {
      global: {
        stubs: {
          BarraDeProgresso: true,
          IdentificadorDaPagina: true,
          PreviewDeArquivo: true,
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.get(".app-header__end").text()).toBe("Ana · Designer");
  });

  it("calcula medidores circulares independentes para grades e unidades", async () => {
    dependencias.ordens.value = [ordemComImagem()];
    dependencias.baixarArquivo.mockResolvedValue(new Blob([], { type: "image/png" }));
    const wrapper = mount(TelaExecucaoProcesso, {
      global: {
        stubs: {
          AppHeader: true,
          BarraDeProgresso: true,
          IdentificadorDaPagina: true,
          PreviewDeArquivo: true,
          RouterLink: true,
        },
      },
    });
    await flushPromises();

    const medidores = wrapper.findAll(".meter-value");
    expect(medidores).toHaveLength(3);
    expect(medidores[1].text()).toContain("4/ 5 grades");
    expect(medidores[1].attributes("style")).toContain("--meter-progress: 80.00%");
    expect(medidores[2].text()).toContain("28/ 30 unidades");
    expect(medidores[2].attributes("style")).toContain("--meter-progress: 93.33%");
  });
});
