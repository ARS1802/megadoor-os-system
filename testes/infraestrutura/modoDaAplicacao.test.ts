import { describe, expect, it } from "vitest";
import { determinarModoDaAplicacao } from "@/infraestrutura/firebase/modoDaAplicacao";

const configuracaoCompleta = {
  apiKey: "api-key",
  authDomain: "megadoor-os-system.firebaseapp.com",
  projectId: "megadoor-os-system",
  storageBucket: "megadoor-os-system.firebasestorage.app",
  messagingSenderId: "378227598678",
  appId: "app-id",
};

describe("modo da aplicação", () => {
  it("usa DEMO quando nenhuma configuração Firebase foi informada", () => {
    expect(
      determinarModoDaAplicacao({
        configuracaoFirebase: Object.fromEntries(
          Object.keys(configuracaoCompleta).map((chave) => [chave, undefined]),
        ),
      }),
    ).toBe("DEMO");
  });

  it("isola EMULADORES quando a opção correspondente está ativa", () => {
    expect(
      determinarModoDaAplicacao({
        usarEmuladores: "true",
        configuracaoFirebase: { ...configuracaoCompleta, projectId: "demo-megadoor" },
      }),
    ).toBe("EMULADORES");
  });

  it("aceita o valor legado sem diferença entre maiúsculas e minúsculas", () => {
    expect(
      determinarModoDaAplicacao({
        usarEmuladores: " TRUE ",
        configuracaoFirebase: { ...configuracaoCompleta, projectId: "demo-megadoor" },
      }),
    ).toBe("EMULADORES");
  });

  it("usa REAL somente com a configuração completa do projeto oficial", () => {
    expect(determinarModoDaAplicacao({ configuracaoFirebase: configuracaoCompleta })).toBe("REAL");
  });

  it("permite forçar DEMO nos testes mesmo quando existe configuração local", () => {
    expect(
      determinarModoDaAplicacao({
        modoExplicito: "DEMO",
        configuracaoFirebase: configuracaoCompleta,
      }),
    ).toBe("DEMO");
  });

  it("recusa configuração parcial em vez de fazer fallback para DEMO", () => {
    expect(() =>
      determinarModoDaAplicacao({
        configuracaoFirebase: { ...configuracaoCompleta, appId: "" },
      }),
    ).toThrow("configuração Firebase está incompleta");
  });

  it("recusa outro projeto no modo REAL", () => {
    expect(() =>
      determinarModoDaAplicacao({
        modoExplicito: "REAL",
        configuracaoFirebase: { ...configuracaoCompleta, projectId: "outro-projeto" },
      }),
    ).toThrow("megadoor-os-system");
  });

  it("recusa REAL explícito quando a opção legada exige emuladores", () => {
    expect(() =>
      determinarModoDaAplicacao({
        modoExplicito: "REAL",
        usarEmuladores: "true",
        configuracaoFirebase: configuracaoCompleta,
      }),
    ).toThrow("Configuração contraditória");
  });

  it("recusa EMULADORES explícito quando a opção legada os desativa", () => {
    expect(() =>
      determinarModoDaAplicacao({
        modoExplicito: "EMULADORES",
        usarEmuladores: "false",
        configuracaoFirebase: { ...configuracaoCompleta, projectId: "demo-megadoor" },
      }),
    ).toThrow("Configuração contraditória");
  });

  it("recusa valor legado desconhecido em vez de assumir conexão REAL", () => {
    expect(() =>
      determinarModoDaAplicacao({
        usarEmuladores: "sim",
        configuracaoFirebase: configuracaoCompleta,
      }),
    ).toThrow("VITE_USAR_EMULADORES inválido");
  });

  it("mantém DEMO como sobreposição segura mesmo com a opção legada ativa", () => {
    expect(
      determinarModoDaAplicacao({
        modoExplicito: "DEMO",
        usarEmuladores: "true",
        configuracaoFirebase: configuracaoCompleta,
      }),
    ).toBe("DEMO");
  });
});
