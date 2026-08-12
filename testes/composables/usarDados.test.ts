import { afterEach, describe, expect, it, vi } from "vitest";

interface OpcoesDosRepositorios {
  falhaNoCarregamento?: Error;
}

async function importarDadosReais(opcoes: OpcoesDosRepositorios = {}) {
  vi.resetModules();

  const cancelarObservacaoDasOrdens = vi.fn();
  const cancelarObservacaoDosCandidatos = vi.fn();
  const cancelarObservacaoDosMateriais = vi.fn();
  let falharObservacaoDasOrdens: ((falha: Error) => void) | undefined;
  const observarLista = vi.fn((_atualizar: unknown, aoFalhar?: (falha: Error) => void) => {
    falharObservacaoDasOrdens = aoFalhar;
    return cancelarObservacaoDasOrdens;
  });
  const observarCandidatos = vi.fn(() => cancelarObservacaoDosCandidatos);
  const observarMateriais = vi.fn(() => cancelarObservacaoDosMateriais);
  const listarOrdens = opcoes.falhaNoCarregamento
    ? vi.fn().mockRejectedValue(opcoes.falhaNoCarregamento)
    : vi.fn().mockResolvedValue([]);
  const listarCandidatos = vi.fn().mockResolvedValue([]);
  const listarMateriais = vi.fn().mockResolvedValue([]);
  let aoEncerrarSessao: (() => void) | undefined;
  const criarOrdensDemonstrativas = vi.fn(() => [{ id: "ordem-demo" }]);
  const criarCandidatosDemonstrativos = vi.fn(() => [{ id: "candidato-demo" }]);
  const criarMateriaisDemonstrativos = vi.fn(() => [{ id: "material-demo" }]);

  vi.doMock("firebase/firestore", () => ({ doc: vi.fn() }));
  vi.doMock("@/infraestrutura/firebase/configuracaoFirebase", () => ({
    firebaseEstaConfigurado: true,
    obterBancoDeDados: vi.fn(),
  }));
  vi.doMock("@/composables/usarSessao", () => ({
    observarFimDaSessao: vi.fn((observar: () => void) => {
      aoEncerrarSessao = observar;
      return vi.fn();
    }),
  }));
  vi.doMock("@/infraestrutura/demonstracao/dadosDemonstrativos", () => ({
    criarOrdensDemonstrativas,
    criarCandidatosDemonstrativos,
    criarMateriaisDemonstrativos,
  }));
  vi.doMock("@/infraestrutura/servicosDaAplicacao", () => ({
    repositorioDeCandidatos: {
      listarAtivos: listarCandidatos,
      observarAtivos: observarCandidatos,
      obterPorReferencia: vi.fn(),
    },
    repositorioDeMateriais: {
      listarAtivos: listarMateriais,
      observarAtivos: observarMateriais,
      obterPorReferencia: vi.fn(),
    },
    repositorioDeOrdens: {
      listar: listarOrdens,
      observarLista,
      observarProcessos: vi.fn(),
      marcarComoParadaSeInativa: vi.fn(),
      listarProcessos: vi.fn(),
    },
  }));

  const { usarDados } = await import("@/composables/usarDados");
  return {
    aoEncerrarSessao: () => {
      if (!aoEncerrarSessao) throw new Error("Observação da sessão não instalada.");
      return aoEncerrarSessao;
    },
    cancelarObservacaoDasOrdens,
    cancelarObservacaoDosCandidatos,
    cancelarObservacaoDosMateriais,
    criarCandidatosDemonstrativos,
    criarMateriaisDemonstrativos,
    criarOrdensDemonstrativas,
    dados: usarDados(),
    falharObservacaoDasOrdens: (falha: Error) => falharObservacaoDasOrdens?.(falha),
    listarCandidatos,
    listarMateriais,
    listarOrdens,
    observarLista,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("dados no modo REAL", () => {
  it("começa vazio e não cria fixtures demonstrativas", async () => {
    const ambiente = await importarDadosReais();

    expect(ambiente.dados.estado.value).toBe("INICIAL");
    expect(ambiente.dados.ordens.value).toEqual([]);
    expect(ambiente.dados.candidatos.value).toEqual([]);
    expect(ambiente.dados.materiais.value).toEqual([]);
    expect(ambiente.criarOrdensDemonstrativas).not.toHaveBeenCalled();
    expect(ambiente.criarCandidatosDemonstrativos).not.toHaveBeenCalled();
    expect(ambiente.criarMateriaisDemonstrativos).not.toHaveBeenCalled();
  });

  it("expõe a falha real e mantém as coleções vazias, sem fallback DEMO", async () => {
    const falha = new Error("Firestore indisponível");
    const ambiente = await importarDadosReais({ falhaNoCarregamento: falha });

    await expect(ambiente.dados.carregar()).rejects.toBe(falha);

    expect(ambiente.dados.estado.value).toBe("ERRO");
    expect(ambiente.dados.erro.value).toBe(falha);
    expect(ambiente.dados.ordens.value).toEqual([]);
    expect(ambiente.dados.candidatos.value).toEqual([]);
    expect(ambiente.dados.materiais.value).toEqual([]);
    expect(ambiente.criarOrdensDemonstrativas).not.toHaveBeenCalled();
  });

  it("cancela listeners e volta ao estado inicial quando a sessão termina", async () => {
    const ambiente = await importarDadosReais();

    await ambiente.dados.carregar();
    expect(ambiente.dados.estado.value).toBe("PRONTO");
    expect(ambiente.observarLista).toHaveBeenCalledOnce();

    ambiente.aoEncerrarSessao()();

    expect(ambiente.cancelarObservacaoDasOrdens).toHaveBeenCalledOnce();
    expect(ambiente.cancelarObservacaoDosCandidatos).toHaveBeenCalledOnce();
    expect(ambiente.cancelarObservacaoDosMateriais).toHaveBeenCalledOnce();
    expect(ambiente.dados.estado.value).toBe("INICIAL");
    expect(ambiente.dados.ordens.value).toEqual([]);
    expect(ambiente.dados.candidatos.value).toEqual([]);
    expect(ambiente.dados.materiais.value).toEqual([]);

    ambiente.falharObservacaoDasOrdens(new Error("evento atrasado"));
    expect(ambiente.dados.estado.value).toBe("INICIAL");
  });

  it("impede inserções demonstrativas acidentais no modo REAL", async () => {
    const ambiente = await importarDadosReais();

    expect(() => ambiente.dados.adicionarCandidatoDemonstrativo("Incorreto")).toThrow(
      "fora do modo DEMO",
    );
    expect(() => ambiente.dados.adicionarMaterialDemonstrativo("Incorreto", "Teste")).toThrow(
      "fora do modo DEMO",
    );
  });
});
