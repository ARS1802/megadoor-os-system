import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function entrar(page: Page, cargo: "admin" | "designer" | "maquinista"): Promise<void> {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill(`${cargo}@megadoor.local`);
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("Designer seleciona explicitamente o processo e valida o arquivo do reupload", async ({
  page,
}) => {
  await entrar(page, "designer");
  await page.goto("/#/ordens/OS-2026-001");

  const previa = page.locator(".file-preview-card");
  await expect(previa.getByText("Modificado em", { exact: true })).toBeVisible();
  await expect(previa).not.toContainText("Não informado pelo servidor");

  const botaoReupload = page.getByRole("button", { name: "Reupload" });
  await expect(botaoReupload).toBeDisabled();

  const primeiraLinha = page
    .getByRole("table", { name: "Arquivos da Ordem de Serviço" })
    .locator("tbody tr")
    .first();
  await primeiraLinha.click();
  await expect(primeiraLinha).toHaveAttribute("aria-selected", "true");
  await expect(botaoReupload).toBeEnabled();

  const seletorInvalido = page.waitForEvent("filechooser");
  await botaoReupload.click();
  await (
    await seletorInvalido
  ).setFiles({
    name: "impressao-corrigida.plt",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("arquivo inválido para impressão"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "O processo de impressão aceita apenas .pdf, .jpg, .jpeg, .png.",
  );

  const seletorValido = page.waitForEvent("filechooser");
  await botaoReupload.click();
  await (
    await seletorValido
  ).setFiles({
    name: "impressao-corrigida.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("arquivo corrigido"),
  });
  await expect(previa.getByText("impressao-corrigida.pdf", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.locator(".order-files-card").getByRole("link", { name: "Abrir registros" }).click();
  const leitor = page.getByRole("log");
  await expect(leitor).toContainText("EVENTO=ARQUIVO_SUBSTITUIDO");
  await expect(leitor).toContainText("USUARIO=designer");
  await expect(leitor).toContainText("PROCESSO=IMPRESSAO");
  await expect(leitor).toContainText("ARQUIVO_ANTERIOR=Grade_Candidato_Norte_ADESIVO_15x15.pdf");
  await expect(leitor).toContainText("ARQUIVO_NOVO=impressao-corrigida.pdf");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar CSV" }).click(),
  ]);
  const caminho = await download.path();
  expect(caminho).not.toBeNull();
  const csv = await readFile(caminho!, "utf8");
  expect(csv).toContain('"ARQUIVO_SUBSTITUIDO"');
  expect(csv).toContain('"designer","Impressão"');
  expect(csv).toContain('"Grade_Candidato_Norte_ADESIVO_15x15.pdf"');
  expect(csv).toContain('"impressao-corrigida.pdf"');
  expect(csv).toContain('"ordens-de-servico/OS-2026-001/impressao/impressao-corrigida.pdf"');
});

test("Maquinista não recebe a ação de reupload", async ({ page }) => {
  await entrar(page, "maquinista");
  await page.goto("/#/ordens/OS-2026-001");
  await page
    .getByRole("table", { name: "Arquivos da Ordem de Serviço" })
    .locator("tbody tr")
    .first()
    .click();

  await expect(page.getByRole("button", { name: "Reupload" })).toHaveCount(0);
});

test("Administrador pode selecionar um processo para reupload", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/#/ordens/OS-2026-001");

  const botaoReupload = page.getByRole("button", { name: "Reupload" });
  await expect(botaoReupload).toBeDisabled();
  await page
    .getByRole("table", { name: "Arquivos da Ordem de Serviço" })
    .locator("tbody tr")
    .nth(1)
    .click();
  await expect(botaoReupload).toBeEnabled();
});

test("não oferece reupload quando a Ordem de Serviço está concluída", async ({ page }) => {
  await entrar(page, "designer");
  await page.goto("/#/ordens/OS-2026-003");
  await page
    .getByRole("table", { name: "Arquivos da Ordem de Serviço" })
    .locator("tbody tr")
    .first()
    .click();

  await expect(page.getByRole("button", { name: "Reupload" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Baixar arquivo" })).toBeEnabled();
});
