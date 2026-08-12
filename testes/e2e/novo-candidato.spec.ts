import { expect, test, type Page } from "@playwright/test";

async function entrar(page: Page, cargo: "admin" | "designer"): Promise<void> {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill(`${cargo}@megadoor.local`);
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("Novo candidato abre uma tela e retorna à Nova OS com a seleção preenchida", async ({
  page,
}) => {
  await entrar(page, "admin");
  await page.goto("/#/ordens/nova?retorno=/administracao/resumo");

  await page.getByRole("button", { name: "Selecionar" }).first().click();
  const popup = page.getByRole("dialog", { name: "Candidatos" });
  await popup.getByRole("link", { name: "Novo candidato" }).click();

  await expect(page).toHaveURL(/#\/candidatos\/novo\?retorno=/);
  await expect(page.getByRole("heading", { name: "Cadastrar candidato" })).toBeVisible();

  const botaoCadastrar = page.getByRole("button", { name: "Cadastrar candidato" });
  await expect(botaoCadastrar).toBeDisabled();
  await page.getByLabel("Nome", { exact: true }).fill("Candidato Central");
  await page.getByLabel("Partido (opcional)").fill("Partido Central");
  await page.getByLabel("Número").fill("12.345.678/0001-90");
  await page.getByLabel("Observações (opcional)").fill("Cadastro feito durante a criação da OS.");
  await expect(botaoCadastrar).toBeEnabled();
  await botaoCadastrar.click();

  await expect(page).toHaveURL(/#\/ordens\/nova\?/);
  await expect(page.getByLabel("Candidato")).toHaveValue("Candidato Central");
  await expect(page.getByText("Candidato Candidato Central cadastrado.")).toBeVisible();
  await page.getByRole("link", { name: "Cancelar" }).click();
  await expect(page).toHaveURL(/#\/administracao\/resumo$/);
});

test("Designer pode acessar o cadastro e recebe validação do documento", async ({ page }) => {
  await entrar(page, "designer");
  await page.goto("/#/candidatos/novo?retorno=/ordens/nova");
  await expect(page.getByRole("heading", { name: "Cadastrar candidato" })).toBeVisible();

  await page.getByLabel("Nome", { exact: true }).fill("Candidato Leste");
  await page.getByLabel("Número").fill("123");
  await expect(page.getByText("CNPJ deve conter 14 dígitos.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cadastrar candidato" })).toBeDisabled();
});
