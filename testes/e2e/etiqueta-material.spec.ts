import { expect, test, type Page } from "@playwright/test";

async function entrarComoAdministrador(page: Page): Promise<void> {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("admin@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("abre a etiqueta disponível em popup e retorna o foco ao material", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/ordens/OS-2026-001");

  const material = page.getByRole("link", { name: "Adesivo Branco", exact: true });
  await expect(material).toBeVisible();
  await material.click();

  const popup = page.getByRole("dialog", {
    name: "Etiqueta do material — Adesivo Branco",
  });
  await expect(popup).toBeVisible();
  const imagem = popup.getByRole("img", { name: "Etiqueta do material Adesivo Branco" });
  await expect(imagem).toBeVisible();
  await expect.poll(() => imagem.evaluate((elemento) => elemento.naturalWidth)).toBeGreaterThan(0);

  await popup.getByRole("button", { name: "Fechar popup" }).click();
  await expect(popup).toHaveCount(0);
  await expect(material).toBeFocused();
  await expect(page).toHaveURL(/#\/ordens\/OS-2026-001$/);
});

test("não apresenta material sem etiqueta como link acionável", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/ordens/OS-2026-002");

  await expect(page.getByText("Lona Front", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lona Front", exact: true })).toHaveCount(0);
});
