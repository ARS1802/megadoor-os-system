import { expect, test, type Page } from "@playwright/test";

async function abrirNovoMaterialComoAdministrador(page: Page): Promise<void> {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("admin@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.goto("/#/materiais/novo");
}

test("indica no próprio card se a foto da etiqueta possui formato válido", async ({ page }) => {
  await abrirNovoMaterialComoAdministrador(page);
  const cardDaEtiqueta = page.locator(".material-label-photo");
  const seletorDeArquivo = page.getByLabel("Imagem da etiqueta (opcional)");

  await expect(seletorDeArquivo).toHaveAttribute(
    "accept",
    ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp",
  );

  await seletorDeArquivo.setInputFiles({
    name: "etiqueta.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("arquivo inválido"),
  });
  await expect(cardDaEtiqueta).toHaveClass(/is-invalid/);
  await expect(cardDaEtiqueta.getByRole("alert")).toContainText("Formato inválido");

  await seletorDeArquivo.setInputFiles({
    name: "etiqueta.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("imagem demonstrativa"),
  });
  await expect(cardDaEtiqueta).toHaveClass(/is-valid/);
  await expect(cardDaEtiqueta).not.toHaveClass(/is-invalid/);
  await expect(cardDaEtiqueta).toHaveCSS("border-color", "rgb(36, 138, 61)");
  await expect(cardDaEtiqueta).toContainText("Imagem válida: etiqueta.webp");
});
