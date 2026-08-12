import { expect, test, type Page } from "@playwright/test";

async function entrarComoAdministrador(page: Page): Promise<void> {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("admin@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/administracao\/resumo$/);
}

test("resume a produção em uma linha por candidato", async ({ page }) => {
  await entrarComoAdministrador(page);

  const card = page.getByRole("heading", { name: "Produção por Ordem de Serviço" }).locator("..");
  const tabela = card.getByRole("table", { name: "Produção consolidada por candidato" });
  await expect(tabela.locator("tbody tr")).toHaveCount(3);

  const linhaNorte = tabela.locator("tbody tr").filter({ hasText: "Candidato Norte" });
  await expect(linhaNorte).toHaveCount(1);
  await expect(linhaNorte.locator("td").nth(1)).toHaveText("415,8");
  await expect(linhaNorte.locator("td").nth(2)).toHaveText("0");

  const linhaPraia = tabela.locator("tbody tr").filter({ hasText: "Candidato Praia" });
  await expect(linhaPraia.locator("td").nth(1)).toHaveText("106");
  await expect(linhaPraia.locator("td").nth(2)).toHaveText("1");
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
