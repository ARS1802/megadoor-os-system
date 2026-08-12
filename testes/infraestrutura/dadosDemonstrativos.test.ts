import { describe, expect, it } from "vitest";
import { criarPresencasDemonstrativas } from "@/infraestrutura/demonstracao/dadosDemonstrativos";

describe("presenças demonstrativas", () => {
  it("expõe os usuários fictícios somente no modo DEMO", () => {
    expect(criarPresencasDemonstrativas("DEMO")).toHaveLength(3);
    expect(criarPresencasDemonstrativas("EMULADORES")).toEqual([]);
    expect(criarPresencasDemonstrativas("REAL")).toEqual([]);
  });
});
