import { expect, test } from "@playwright/test";

const CHAVE_SESSAO_DEMO = "megadoor-sessao-demo";

test("início frio ignora a sessão demonstrativa legada e abre o Login", async ({ page }) => {
  await page.addInitScript((chave) => {
    localStorage.setItem(
      chave,
      JSON.stringify({
        id: "demo-designer",
        nome: "Designer antigo",
        email: "designer@megadoor.local",
        cargo: "DESIGNER",
      }),
    );
  }, CHAVE_SESSAO_DEMO);

  await page.goto("/#/");

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("heading", { name: "Produção Campanha" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  expect(await page.evaluate((chave) => localStorage.getItem(chave), CHAVE_SESSAO_DEMO)).toBeNull();
  expect(
    await page.evaluate((chave) => sessionStorage.getItem(chave), CHAVE_SESSAO_DEMO),
  ).toBeNull();
});

test("sessão demonstrativa sobrevive ao reload, mas não a uma nova execução", async ({
  browser,
  page,
}) => {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("designer@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/designer$/);

  await page.reload();
  await expect(page).toHaveURL(/#\/designer$/);
  expect(
    await page.evaluate((chave) => sessionStorage.getItem(chave), CHAVE_SESSAO_DEMO),
  ).not.toBeNull();

  const novaExecucao = await browser.newContext();
  const novaPagina = await novaExecucao.newPage();
  await novaPagina.goto("http://127.0.0.1:4173/#/");
  await expect(novaPagina).toHaveURL(/#\/$/);
  await expect(novaPagina.getByRole("button", { name: "Entrar" })).toBeVisible();
  await novaExecucao.close();
});

test("logout remove a sessão e volta a proteger as rotas privadas", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByText("Modo demonstrativo:")).toBeVisible();
  await page.getByLabel("E-mail").fill("designer@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/designer$/);

  expect(
    await page.evaluate((chave) => sessionStorage.getItem(chave), CHAVE_SESSAO_DEMO),
  ).not.toBeNull();

  await page.goto("/#/configuracoes");
  await page.getByRole("button", { name: "Desconectar" }).click();

  await expect(page).toHaveURL(/#\/$/);
  expect(
    await page.evaluate((chave) => sessionStorage.getItem(chave), CHAVE_SESSAO_DEMO),
  ).toBeNull();

  await page.goto("/#/designer");
  await expect(page).toHaveURL(/#\/\?redirecionar=\/designer$/);
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});
