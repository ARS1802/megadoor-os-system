import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("exporta somente os registros filtrados com o contrato completo", async ({ page }) => {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("admin@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.goto("/#/ordens/OS-2026-001/registros");

  await page.getByLabel("Usuário").selectOption("Tarcyo");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("1 linha(s) após aplicar os filtros.")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("registros-OS-2026-001.csv");
  const caminho = await download.path();
  expect(caminho).not.toBeNull();
  const csv = await readFile(caminho!, "utf8");

  expect(csv).toContain(
    '"data_hora","evento","id_da_operacao","nome_do_usuario","processo","tipo_do_contador","sentido","unidades_adicionadas_ou_removidas","justificativa","impressao_unidades_produzidas","impressao_unidades_faltantes","plotagem_unidades_produzidas","plotagem_unidades_faltantes","corte_unidades_produzidas","corte_unidades_faltantes","nome_do_arquivo_anterior","caminho_do_arquivo_anterior","nome_do_arquivo_novo","caminho_do_arquivo_novo","registro_original"',
  );
  expect(csv).toContain('"AJUSTE_PRODUCAO","demo-2","Tarcyo","Corte","UNIDADE","REMOVER","-3"');
  expect(csv).not.toContain("Arthur");
});

test("registra todos os dados da conclusão forçada na última linha", async ({ page }) => {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("admin@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.goto("/#/ordens/OS-2026-001");

  await page.getByRole("button", { name: "Forçar conclusão" }).click();
  await page.getByLabel("Justificativa").fill("Prazo encerrado com autorização do cliente");
  await page.getByRole("button", { name: "Concluir OS" }).click();
  await page.getByRole("link", { name: "Registros", exact: true }).click();

  const ultimaLinha = page.locator(".registro").last();
  await expect(ultimaLinha).toContainText("EVENTO=CONCLUSAO_FORCADA");
  await expect(ultimaLinha).toContainText("USUARIO=admin");
  await expect(ultimaLinha).toContainText(
    "JUSTIFICATIVA=Prazo encerrado com autorização do cliente",
  );
  await expect(ultimaLinha).toContainText("IMPRESSAO_PRODUZIDAS=52");
  await expect(ultimaLinha).toContainText("IMPRESSAO_FALTANTES=19948");
  await expect(ultimaLinha).toContainText("PLOTAGEM_PRODUZIDAS=0");
  await expect(ultimaLinha).toContainText("PLOTAGEM_FALTANTES=20000");
  await expect(ultimaLinha).toContainText("CORTE_PRODUZIDAS=208");
  await expect(ultimaLinha).toContainText("CORTE_FALTANTES=19792");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar CSV" }).click(),
  ]);
  const caminho = await download.path();
  expect(caminho).not.toBeNull();
  const csv = await readFile(caminho!, "utf8");
  expect(csv).toContain('"CONCLUSAO_FORCADA","","admin"');
  expect(csv).toContain(
    '"Prazo encerrado com autorização do cliente","52","19948","0","20000","208","19792"',
  );
});

test("inclui o ajuste demonstrativo de produção no leitor de registros", async ({ page }) => {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("maquinista@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.goto("/#/ordens/OS-2026-001/processos/impressao");

  await page.getByLabel("Quantidade de unidades").fill("17");
  await page.getByRole("button", { name: "Adicionar unidades" }).click();
  await page.getByRole("link", { name: "Abrir registros" }).click();

  const ultimaLinha = page.locator(".registro").last();
  await expect(ultimaLinha).toContainText("USUARIO=maquinista");
  await expect(ultimaLinha).toContainText("PROCESSO=IMPRESSAO");
  await expect(ultimaLinha).toContainText("UNIDADES=+17");
});
