import { expect, test, type Page } from "@playwright/test";

async function entrarComoAdministrador(page: Page): Promise<void> {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("admin@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/administracao\/resumo$/);
}

test("valida a Nova OS dentro de cada card antes de habilitar a criação", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/ordens/nova");

  const botaoCriar = page.getByRole("button", { name: "Criar Ordem de Serviço" });
  await expect(botaoCriar).toBeDisabled();

  const cardIdentificacao = page.locator("section.card").filter({ hasText: "Identificação" });
  await expect(cardIdentificacao.getByText("Selecione um candidato.")).toBeVisible();
  await expect(cardIdentificacao.getByText("Selecione um material.")).toBeVisible();

  const cardTiragem = page.locator("section.card").filter({ hasText: /^Tiragem/ });
  await expect(cardTiragem.getByLabel("Tiragem")).toHaveValue("1");

  await page.getByLabel("Largura (cm)").first().fill("0");
  const cardUnidade = page.locator("section.card").filter({ hasText: /^Unidade/ });
  await expect(cardUnidade.getByText("Informe uma largura de unidade positiva.")).toBeVisible();
  await expect(botaoCriar).toBeDisabled();
  await page.getByLabel("Largura (cm)").first().fill("1");

  const seletores = page.getByRole("button", { name: "Selecionar" });
  await seletores.nth(0).click();
  await page.locator(".popup-vue .option-button").first().click();
  await seletores.nth(1).click();
  await page.locator(".popup-vue .option-button").first().click();

  const arquivoDeImpressao = page.locator('input[type="file"]').first();
  await arquivoDeImpressao.setInputFiles({
    name: "impressao.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("extensão inválida"),
  });
  await expect(page.locator(".file-upload").first()).toHaveClass(/is-invalid/);
  await expect(botaoCriar).toBeDisabled();

  await arquivoDeImpressao.setInputFiles({
    name: "impressao.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("arquivo demonstrativo"),
  });
  await expect(page.locator(".file-upload").first()).toHaveClass(/is-valid/);
  await expect(botaoCriar).toBeEnabled();
});
