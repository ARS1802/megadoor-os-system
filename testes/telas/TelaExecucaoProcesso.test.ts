import { flushPromises, shallowMount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import TelaExecucaoProcesso from "@/telas/ordensDeServico/TelaExecucaoProcesso.vue";

const falha = new Error("Não foi possível ler as Ordens de Serviço.");

vi.mock("@/composables/usarDados", () => ({
  usarDados: () => ({
    ordens: ref([]),
    carregar: vi.fn().mockRejectedValue(falha),
    carregando: computed(() => false),
    carregado: computed(() => false),
    erro: ref(falha),
  }),
}));

vi.mock("@/composables/usarSessao", () => ({
  usarSessao: () => ({ usuarioAtual: ref(null) }),
}));

vi.mock("@/composables/usarNotificacoes", () => ({
  usarNotificacoes: () => ({ notificar: vi.fn() }),
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
  servidorDeArquivos: { obterMetadadosDoArquivo: vi.fn() },
}));

describe("estado de erro da execucao de processo", () => {
  it("exibe a falha dos dados em vez de manter o carregamento indefinidamente", async () => {
    const wrapper = shallowMount(TelaExecucaoProcesso, {
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(falha.message);
    expect(wrapper.text()).not.toContain("Carregando processo");
  });
});
