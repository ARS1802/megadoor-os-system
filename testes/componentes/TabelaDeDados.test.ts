import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TabelaDeDados from "@/componentes/TabelaDeDados.vue";

const linhas = [
  { id: "2", nome: "Zeca", quantidade: 2 },
  { id: "1", nome: "Ana", quantidade: 10 },
];

describe("TabelaDeDados", () => {
  it("alterna Indiferente, HighLow e LowHigh", async () => {
    const wrapper = mount(TabelaDeDados, {
      props: { rotulo: "Teste", colunas: [{ chave: "nome", rotulo: "Nome" }], linhas },
    });
    const nomes = () => wrapper.findAll("tbody td").map((celula) => celula.text());
    expect(nomes()).toEqual(["Zeca", "Ana"]);
    await wrapper.get("thead button").trigger("click");
    expect(nomes()).toEqual(["Ana", "Zeca"]);
    await wrapper.get("thead button").trigger("click");
    expect(nomes()).toEqual(["Zeca", "Ana"]);
    await wrapper.get("thead button").trigger("click");
    expect(nomes()).toEqual(["Zeca", "Ana"]);
  });

  it("ativa uma linha com Enter e a marca como selecionada", async () => {
    const wrapper = mount(TabelaDeDados, {
      props: { rotulo: "Teste", colunas: [{ chave: "nome", rotulo: "Nome" }], linhas },
    });
    await wrapper.get("tbody tr").trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("ativarLinha")?.[0]?.[0]).toEqual(linhas[0]);
    expect(wrapper.get("tbody tr").classes()).toContain("is-selected");
  });
});
