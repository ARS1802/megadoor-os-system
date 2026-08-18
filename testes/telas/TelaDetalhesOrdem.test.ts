import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, type Ref } from "vue";
import { StatusOrdemDeServico } from "@/dominio/enumeracoes";
import TelaDetalhesOrdem from "@/telas/ordensDeServico/TelaDetalhesOrdem.vue";

const dependencias = vi.hoisted(() => ({
  ordens: null as unknown as Ref<Record<string, unknown>[]>,
  erro: null as unknown as Ref<Error | null>,
  carregar: vi.fn<() => Promise<void>>(),
  lerTexto: vi.fn<(caminho: string) => Promise<string>>(),
  observarProcesso: vi.fn(() => () => undefined),
  notificar: vi.fn(),
}));

vi.mock("@/composables/usarDados", async () => {
  const { computed, ref } = await import("vue");
  dependencias.ordens = ref<Record<string, unknown>[]>([]);
  dependencias.erro = ref<Error | null>(null);
  return {
    usarDados: () => ({
      ordens: dependencias.ordens,
      carregar: dependencias.carregar,
      carregando: computed(() => false),
      carregado: computed(() => true),
      erro: dependencias.erro,
    }),
  };
});

vi.mock("@/composables/usarSessao", async () => {
  const { ref } = await import("vue");
  return {
    usarSessao: () => ({
      usuarioAtual: ref({ id: "designer-1", nome: "Designer", cargo: "DESIGNER" }),
    }),
  };
});

vi.mock("@/composables/usarNotificacoes", () => ({
  usarNotificacoes: () => ({ notificar: dependencias.notificar }),
}));

vi.mock("@/composables/usarNavegacaoContextual", () => ({
  usarNavegacaoContextual: () => ({
    destinoDeRetorno: "/designer",
    preservandoRetorno: (destino: unknown) => destino,
  }),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "OS-TARDIA" } }),
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock("@/infraestrutura/firebase/configuracaoFirebase", () => ({
  firebaseEstaConfigurado: true,
}));

vi.mock("@/infraestrutura/servicosDaAplicacao", () => ({
  casosDeUso: {
    reenviarArquivo: { executar: vi.fn() },
    forcarConclusao: { executar: vi.fn() },
  },
  repositorioDeOrdens: { observarProcesso: dependencias.observarProcesso },
  repositorioDeUsuarios: { referencia: vi.fn() },
  servidorDeArquivos: {
    lerTexto: dependencias.lerTexto,
    obterMetadadosDoArquivo: vi.fn(),
    baixarArquivo: vi.fn(),
  },
}));

function ordemCarregadaDepoisDoMount(): Record<string, unknown> {
  return {
    id: "OS-TARDIA",
    candidatoId: "candidato-1",
    materialId: "material-1",
    nomeDoCandidato: "Candidato",
    nomeDoMaterial: "Material",
    dimensoesDaUnidade: "10 × 20 cm",
    larguraDaUnidadeEmCentimetros: 10,
    alturaDaUnidadeEmCentimetros: 20,
    larguraGrade: 100,
    alturaGrade: 200,
    unidadesPorGrade: 2,
    quantidadeTotal: 10,
    tiragem: 1,
    status: StatusOrdemDeServico.PRONTA,
    processos: [],
    caminhoRegistro: "ordens-de-servico/OS-TARDIA/registro.txt",
    caminhoObservacao: "ordens-de-servico/OS-TARDIA/observacao.txt",
    criadaEm: new Date("2026-08-12T12:00:00-03:00"),
  };
}

describe("observação nos detalhes da Ordem de Serviço", () => {
  beforeEach(() => {
    dependencias.ordens.value = [];
    dependencias.erro.value = null;
    dependencias.carregar.mockReset().mockResolvedValue(undefined);
    dependencias.lerTexto.mockReset().mockResolvedValue("Observação carregada após o listener.");
    dependencias.observarProcesso.mockClear();
    dependencias.notificar.mockClear();
  });

  it("carrega observacao.txt quando a OS chega depois do onMounted", async () => {
    const wrapper = shallowMount(TelaDetalhesOrdem, {
      global: {
        stubs: { RouterLink: true },
      },
    });
    await flushPromises();

    expect(dependencias.lerTexto).not.toHaveBeenCalled();

    dependencias.ordens.value = [ordemCarregadaDepoisDoMount()];
    await nextTick();
    await flushPromises();

    expect(dependencias.lerTexto).toHaveBeenCalledOnce();
    expect(dependencias.lerTexto).toHaveBeenCalledWith(
      "ordens-de-servico/OS-TARDIA/observacao.txt",
    );
    expect(wrapper.get(".observacao-os").text()).toContain("Observação carregada após o listener.");
  });

  it("mostra a falha dos dados em vez de permanecer no carregamento", async () => {
    dependencias.carregar.mockRejectedValueOnce(new Error("Firestore indisponivel"));
    dependencias.erro.value = new Error("Firestore indisponivel");

    const wrapper = shallowMount(TelaDetalhesOrdem, {
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    const mensagem = wrapper.get('[role="alert"]');
    expect(mensagem.text()).toContain("Firestore indisponivel");
    expect(wrapper.text()).not.toContain("Carregando Ordem de Serviço");
  });
});
