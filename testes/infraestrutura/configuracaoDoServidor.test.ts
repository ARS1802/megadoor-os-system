import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configuracaoDoServidor,
  enderecoBaseDoServidor,
  inicializarConfiguracaoDoServidor,
  instalacaoAnteriorFoiSubstituida,
  salvarConfiguracaoDoServidor,
} from "@/infraestrutura/servidor/configuracaoDoServidor";

const CHAVE = "megadoor-configuracao-servidor";

function respostaJson(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("configuração do servidor de arquivos", () => {
  beforeEach(() => {
    localStorage.clear();
    configuracaoDoServidor.endereco = "192.168.0.10";
    configuracaoDoServidor.porta = 8443;
  });

  it("usa e persiste a configuração de runtime fornecida pelo instalador", async () => {
    const buscar = vi.fn().mockResolvedValue(
      respostaJson({
        schemaVersion: 1,
        installationId: "instalacao-A1",
        server: { address: "192.168.18.206", port: 8443 },
      }),
    );

    await expect(inicializarConfiguracaoDoServidor(buscar)).resolves.toBe("runtime");
    expect(buscar).toHaveBeenCalledWith("/runtime-config.json", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    expect(configuracaoDoServidor).toEqual({ endereco: "192.168.18.206", porta: 8443 });
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? "null")).toEqual({
      installationId: "instalacao-A1",
      server: {
        endereco: "192.168.18.206",
        porta: 8443,
      },
      runtimeServer: {
        endereco: "192.168.18.206",
        porta: 8443,
      },
    });
    expect(enderecoBaseDoServidor()).toBe("https://192.168.18.206:8443");
  });

  it("preserva a escolha posterior do usuário quando pertence à mesma instalação", async () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify({
        installationId: "instalacao-A1",
        server: { endereco: "192.168.1.50", porta: 9443 },
        runtimeServer: { endereco: "192.168.18.206", porta: 8443 },
      }),
    );
    const buscar = vi.fn().mockResolvedValue(
      respostaJson({
        schemaVersion: 1,
        installationId: "instalacao-A1",
        server: { address: "192.168.18.206", port: 8443 },
      }),
    );

    await expect(inicializarConfiguracaoDoServidor(buscar)).resolves.toBe("armazenamento-local");
    expect(buscar).toHaveBeenCalledOnce();
    expect(configuracaoDoServidor).toEqual({ endereco: "192.168.1.50", porta: 9443 });
  });

  it("descarta a preferência de uma instalação anterior e substitui seu armazenamento", async () => {
    localStorage.setItem("megadoor-tema", "dark");
    sessionStorage.setItem("megadoor-sessao-demo", "sessao-antiga");
    localStorage.setItem(
      CHAVE,
      JSON.stringify({
        installationId: "instalacao-antiga",
        server: { endereco: "192.168.1.50", porta: 9443 },
      }),
    );
    const buscar = vi.fn().mockResolvedValue(
      respostaJson({
        schemaVersion: 1,
        installationId: "instalacao-nova",
        server: { address: "10.0.0.20", port: 8443 },
      }),
    );

    await expect(inicializarConfiguracaoDoServidor(buscar)).resolves.toBe("runtime");
    expect(configuracaoDoServidor).toEqual({ endereco: "10.0.0.20", porta: 8443 });
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? "null")).toEqual({
      installationId: "instalacao-nova",
      server: { endereco: "10.0.0.20", porta: 8443 },
      runtimeServer: { endereco: "10.0.0.20", porta: 8443 },
    });
    expect(localStorage.getItem("megadoor-tema")).toBeNull();
    expect(sessionStorage.getItem("megadoor-sessao-demo")).toBeNull();
    expect(instalacaoAnteriorFoiSubstituida()).toBe(true);
  });

  it("aplica o novo servidor informado na reinstalação sem apagar preferências gerais", async () => {
    localStorage.setItem("megadoor-tema", "dark");
    localStorage.setItem(
      CHAVE,
      JSON.stringify({
        installationId: "instalacao-A1",
        server: { endereco: "192.168.1.50", porta: 9443 },
        runtimeServer: { endereco: "192.168.18.206", porta: 8443 },
      }),
    );
    const buscar = vi.fn().mockResolvedValue(
      respostaJson({
        schemaVersion: 1,
        installationId: "instalacao-A1",
        server: { address: "10.0.0.20", port: 8443 },
      }),
    );

    await expect(inicializarConfiguracaoDoServidor(buscar)).resolves.toBe("runtime");

    expect(configuracaoDoServidor).toEqual({ endereco: "10.0.0.20", porta: 8443 });
    expect(localStorage.getItem("megadoor-tema")).toBe("dark");
    expect(instalacaoAnteriorFoiSubstituida()).toBe(false);
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? "null")).toEqual({
      installationId: "instalacao-A1",
      server: { endereco: "10.0.0.20", porta: 8443 },
      runtimeServer: { endereco: "10.0.0.20", porta: 8443 },
    });
  });

  it.each([
    {
      schemaVersion: 2,
      installationId: "instalacao-A1",
      server: { address: "192.168.18.206", port: 8443 },
    },
    {
      schemaVersion: 1,
      installationId: "inválido",
      server: { address: "192.168.18.206", port: 8443 },
    },
    {
      schemaVersion: 1,
      installationId: "instalacao-A1",
      server: { address: "999.168.18.206", port: 8443 },
    },
    {
      schemaVersion: 1,
      installationId: "instalacao-A1",
      server: { address: "192.168.18.206", port: 70_000 },
    },
    {
      schemaVersion: 1,
      installationId: "instalacao-A1",
      server: { address: "192.168.18.206", port: 8443 },
      extra: true,
    },
  ])("recusa runtime incompatível e mantém o fallback existente", async (dados) => {
    const buscar = vi.fn().mockResolvedValue(respostaJson(dados));

    await expect(inicializarConfiguracaoDoServidor(buscar)).resolves.toBe("padrao");
    expect(configuracaoDoServidor).toEqual({ endereco: "192.168.0.10", porta: 8443 });
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });

  it("mantém o fallback quando o arquivo não está disponível", async () => {
    const buscar = vi.fn().mockRejectedValue(new TypeError("Falha de rede"));

    await expect(inicializarConfiguracaoDoServidor(buscar)).resolves.toBe("padrao");
    expect(configuracaoDoServidor).toEqual({ endereco: "192.168.0.10", porta: 8443 });
  });

  it("não solicita runtime-config em builds comuns", async () => {
    const buscar = vi.spyOn(globalThis, "fetch");
    try {
      await expect(inicializarConfiguracaoDoServidor()).resolves.toBe("padrao");
      expect(buscar).not.toHaveBeenCalled();
    } finally {
      buscar.mockRestore();
    }
  });

  it("não usa uma preferência antiga quando o runtime instalado responde com erro", async () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify({
        installationId: "instalacao-antiga",
        server: { endereco: "192.168.1.50", porta: 9443 },
      }),
    );
    const buscar = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(inicializarConfiguracaoDoServidor(buscar)).resolves.toBe("padrao");
    expect(configuracaoDoServidor).toEqual({ endereco: "192.168.0.10", porta: 8443 });
  });

  it("mantém compatibilidade com o armazenamento antigo quando não há runtime", async () => {
    localStorage.setItem(CHAVE, JSON.stringify({ endereco: "192.168.1.50", porta: 9443 }));
    const buscar = vi.fn().mockRejectedValue(new TypeError("Aplicação em desenvolvimento"));

    await expect(inicializarConfiguracaoDoServidor(buscar)).resolves.toBe("armazenamento-local");
    expect(configuracaoDoServidor).toEqual({ endereco: "192.168.1.50", porta: 9443 });
  });

  it("normaliza e persiste alterações no namespace da instalação atual", async () => {
    const buscar = vi.fn().mockResolvedValue(
      respostaJson({
        schemaVersion: 1,
        installationId: "instalacao-A1",
        server: { address: "192.168.18.206", port: 8443 },
      }),
    );
    await inicializarConfiguracaoDoServidor(buscar);

    salvarConfiguracaoDoServidor({ endereco: " 192.168.1.25 ", porta: 8443 });

    expect(configuracaoDoServidor).toEqual({ endereco: "192.168.1.25", porta: 8443 });
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? "null")).toEqual({
      installationId: "instalacao-A1",
      server: { endereco: "192.168.1.25", porta: 8443 },
      runtimeServer: { endereco: "192.168.18.206", porta: 8443 },
    });
  });
});
