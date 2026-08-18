import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MedidorCircular from "@/componentes/MedidorCircular.vue";

describe("MedidorCircular", () => {
  it("preenche e esvazia a circunferência conforme o valor muda", async () => {
    const wrapper = mount(MedidorCircular, {
      props: { valor: 28, maximo: 30, unidade: "unidades" },
    });

    expect(wrapper.attributes("style")).toContain("--meter-progress: 93.33%");
    expect(wrapper.attributes("aria-valuetext")).toBe("28 de 30 unidades");

    await wrapper.setProps({ valor: 14 });
    expect(wrapper.attributes("style")).toContain("--meter-progress: 46.67%");
  });

  it("limita apenas o desenho a 100%, preservando o total produzido no texto", () => {
    const wrapper = mount(MedidorCircular, {
      props: { valor: 35, maximo: 30, unidade: "unidades" },
    });

    expect(wrapper.attributes("style")).toContain("--meter-progress: 100.00%");
    expect(wrapper.text()).toContain("35/ 30 unidades");
    expect(wrapper.attributes("aria-valuenow")).toBe("30");
  });
});
