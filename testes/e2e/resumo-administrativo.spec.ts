import { expect, test, type Page } from "@playwright/test";

async function entrarComoAdministrador(page: Page): Promise<void> {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("admin@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/administracao\/resumo$/);
}

test("resume a produção em uma linha por candidato e material", async ({ page }) => {
  await entrarComoAdministrador(page);

  await expect(page.getByText("admin · Administrador", { exact: true })).toBeVisible();

  const card = page.getByRole("heading", { name: "Produção por Ordem de Serviço" }).locator("..");
  const tabela = card.getByRole("table", {
    name: "Produção consolidada por candidato e material",
  });
  await expect(tabela.locator("tbody tr")).toHaveCount(3);

  const linhaNorte = tabela.locator("tbody tr").filter({ hasText: "Candidato Norte" });
  await expect(linhaNorte).toHaveCount(1);
  await expect(linhaNorte.locator("td").nth(1)).toHaveText("Adesivo Branco");
  await expect(linhaNorte.locator("td").nth(2)).toHaveText("1,17");

  const linhaPraia = tabela.locator("tbody tr").filter({ hasText: "Candidato Praia" });
  await expect(linhaPraia.locator("td").nth(1)).toHaveText("Perfurado");
  await expect(linhaPraia.locator("td").nth(2)).toHaveText("135,3");
});

test("Administrador abre a OS atual e navega por todas as etapas sem perder o resumo", async ({
  page,
}) => {
  await entrarComoAdministrador(page);

  const linhaDaOrdem = page
    .getByRole("table", { name: "Ordens recentes" })
    .locator("tbody tr")
    .first();
  await linhaDaOrdem.click();

  await expect(page).toHaveURL(/#\/ordens\/OS-2026-001\?retorno=\/administracao\/resumo$/);
  const idDaOrdem = "OS-2026-001";
  const abas = [
    ["Impressão", "impressao"],
    ["Plotagem", "plotagem"],
    ["Corte", "corte"],
  ] as const;

  for (const [rotulo, segmento] of abas) {
    const aba = page.getByRole("link", { name: rotulo, exact: true });
    await expect(aba).toHaveAttribute(
      "href",
      `#/ordens/${idDaOrdem}/processos/${segmento}?retorno=/administracao/resumo`,
    );
    await aba.click();
    await expect(page).toHaveURL(
      new RegExp(`#/ordens/${idDaOrdem}/processos/${segmento}\\?retorno=/administracao/resumo$`),
    );
    await expect(
      page.getByRole("heading", { name: new RegExp(`Produção de ${rotulo}`, "i") }),
    ).toBeVisible();
  }

  const ajuste = page.getByRole("heading", { name: "Ajustar produção" }).locator("..");
  await expect(ajuste.locator(".meter-value")).toHaveCount(2);
  await expect(ajuste.locator(".meter-value").first()).toContainText("4/ 385 grades");
  await expect(ajuste.locator(".meter-value").nth(1)).toContainText("208/ 20.000 unidades");
  const atividade = page.locator("section.card").filter({
    has: page.getByRole("heading", { name: "Atividade recente" }),
  });
  await expect(atividade.getByText("OPERACAO=demo-1", { exact: false })).toBeVisible();

  await page.getByRole("link", { name: /Detalhes/ }).click();
  await page.getByRole("link", { name: /Ordens/ }).click();
  await expect(page).toHaveURL(/#\/administracao\/resumo$/);

  const ordemConcluida = page
    .getByRole("table", { name: "Ordens concluídas" })
    .getByRole("link", { name: "Candidato Praia" });
  await ordemConcluida.click();
  await expect(page).toHaveURL(/#\/ordens\/OS-2026-003\?retorno=\/administracao\/resumo$/);

  const abaDeCorte = page.getByRole("link", { name: "Corte", exact: true });
  await expect(abaDeCorte).toHaveAttribute(
    "href",
    "#/ordens/OS-2026-003/processos/corte?retorno=/administracao/resumo",
  );
  await abaDeCorte.click();
  await expect(page).toHaveURL(
    /#\/ordens\/OS-2026-003\/processos\/corte\?retorno=\/administracao\/resumo$/,
  );
});
