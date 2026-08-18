import { expect, test, type Page } from "@playwright/test";

async function entrarComoAdministrador(page: Page): Promise<void> {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("admin@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/administracao\/resumo$/);
}

function valorPrincipalDaProducao(page: Page) {
  return page
    .getByRole("heading", { name: /Produção de /i })
    .locator("..")
    .locator(".meter-value span");
}

test("navega por linha, processo e mantém o layout desktop", async ({ page }) => {
  const erros: string[] = [];
  page.on("console", (mensagem) => {
    if (mensagem.type() === "error") erros.push(mensagem.text());
  });
  await entrarComoAdministrador(page);
  await page.goto("/#/administracao/resumo");
  const semRolagemHorizontal = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(semRolagemHorizontal).toBe(true);

  await page
    .getByRole("table", { name: "Ordens recentes" })
    .locator("tbody tr")
    .first()
    .press("Enter");
  await expect(page.getByRole("heading", { name: "Estado atual da OS" })).toBeVisible();
  await expect(page.getByText("ID da Ordem de Serviço:")).toBeVisible();
  await page.getByRole("link", { name: "Impressão" }).click();
  await expect(page.getByRole("heading", { name: /Produção de impressão/i })).toBeVisible();
  await page.getByRole("link", { name: /Detalhes/ }).click();
  await page.getByRole("link", { name: /Ordens/ }).click();
  await expect(page).toHaveURL(/#\/administracao\/resumo$/);
  expect(erros).toEqual([]);
});

test("organiza os dados da OS nas duas colunas solicitadas", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/ordens/OS-2026-001");

  const colunas = page.locator(".order-data-column");
  await expect(colunas).toHaveCount(2);

  const esquerda = colunas.nth(0);
  await expect(esquerda).toContainText("Nome do candidato");
  await expect(esquerda).toContainText("Candidato Norte");
  await expect(esquerda).toContainText("Tamanho da unidade");
  await expect(esquerda).toContainText("Nome do material");
  await expect(esquerda).toContainText("Quantidade total");
  await expect(esquerda).toContainText("Unidades por grade");

  const direita = colunas.nth(1);
  await expect(direita).toContainText("Partido");
  await expect(direita).toContainText("Partido Nacional");
  await expect(direita).toContainText("Tiragem");
  await expect(direita).toContainText("CNPJ");
  await expect(direita).toContainText("12.345.678/0001-90");

  const [caixaEsquerda, caixaDireita] = await Promise.all([
    esquerda.boundingBox(),
    direita.boundingBox(),
  ]);
  expect(caixaEsquerda).not.toBeNull();
  expect(caixaDireita).not.toBeNull();
  expect(caixaDireita!.x).toBeGreaterThan(caixaEsquerda!.x + caixaEsquerda!.width / 2);
});

test("persiste o tema escuro durante a navegação", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/configuracoes");
  await page.getByRole("button", { name: "Alternar tema escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(23, 25, 28)");
  await page.goto("/#/administracao/resumo");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("mantém a navegação do Administrador no contexto administrativo", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.getByRole("link", { name: "Nova OS" }).click();
  await page.getByRole("link", { name: /Painel/ }).click();
  await expect(page).toHaveURL(/#\/administracao\/resumo$/);

  await page.goto("/#/administracao/resumo");
  await page.getByRole("link", { name: /Configurações/ }).click();
  await page.getByRole("link", { name: /Voltar/ }).click();
  await expect(page).toHaveURL(/#\/administracao\/resumo$/);
});

test("mantém o Designer no fluxo da OS ao abrir uma etapa", async ({ page }) => {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("designer@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/designer$/);

  await page
    .getByRole("table", { name: "Ordens de Serviço" })
    .locator("tbody tr")
    .first()
    .press("Enter");
  await expect(page).toHaveURL(/#\/ordens\/[^?]+\?retorno=\/designer$/);

  await page.getByRole("link", { name: "Impressão" }).click();
  await expect(page).toHaveURL(/#\/ordens\/[^/]+\/processos\/impressao\?retorno=\/designer$/);
  await expect(page.getByRole("heading", { name: /Produção de impressão/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ajustar produção" })).toBeVisible();
  await expect(valorPrincipalDaProducao(page)).toHaveText("52");
  await page.getByRole("button", { name: "+1 grade" }).click();
  await expect(valorPrincipalDaProducao(page)).toHaveText("104");
  await expect(
    page
      .locator("section.card")
      .filter({ has: page.getByRole("heading", { name: "Atividade recente" }) })
      .getByText("USUARIO=designer", { exact: false }),
  ).toBeVisible();

  await page.getByRole("link", { name: /Detalhes/ }).click();
  await page.getByRole("link", { name: /Ordens/ }).click();
  await expect(page).toHaveURL(/#\/designer$/);
});

test("mantém o Maquinista no fluxo da OS ao abrir uma etapa", async ({ page }) => {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill("maquinista@megadoor.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/#\/maquinista$/);

  await page
    .getByRole("table", { name: "Ordens de Serviço" })
    .locator("tbody tr")
    .first()
    .press("Enter");
  await page.getByRole("link", { name: "Impressão" }).click();
  await expect(page).toHaveURL(/#\/ordens\/[^/]+\/processos\/impressao\?retorno=\/maquinista$/);

  await page.getByRole("link", { name: /Detalhes/ }).click();
  await page.getByRole("link", { name: /Ordens/ }).click();
  await expect(page).toHaveURL(/#\/maquinista$/);
});

test("retorna cada cargo ao próprio painel pelas Configurações", async ({ page }) => {
  for (const [email, painel] of [
    ["designer@megadoor.local", "designer"],
    ["maquinista@megadoor.local", "maquinista"],
  ] as const) {
    await page.goto("/#/");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-demo");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(new RegExp(`#/${painel}$`));

    await page.getByRole("link", { name: /Configurações/ }).click();
    await page.getByRole("link", { name: /Voltar/ }).click();
    await expect(page).toHaveURL(new RegExp(`#/${painel}$`));

    await page.goto("/#/configuracoes");
    await page.getByRole("button", { name: "Desconectar" }).click();
  }
});

test("permite ajustar várias unidades de uma vez no processo atual", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/ordens/OS-2026-001/processos/corte");
  await page.getByLabel("Quantidade de unidades").fill("173");
  await page.getByRole("button", { name: "Remover unidades" }).click();
  await expect(valorPrincipalDaProducao(page)).toHaveText("35");
  await page.getByRole("button", { name: "Adicionar unidades" }).click();
  await expect(valorPrincipalDaProducao(page)).toHaveText("208");
});

test("bloqueia novas adições quando um processo atinge 100%", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/ordens/OS-2026-001/processos/impressao");

  await page.getByLabel("Quantidade de unidades").fill("19948");
  await page.getByRole("button", { name: "Adicionar unidades" }).click();

  await expect(valorPrincipalDaProducao(page)).toHaveText("20.000");
  await expect(page.getByText(/Meta atingida\. Adições estão bloqueadas/)).toBeVisible();
  await expect(page.getByRole("button", { name: "+1 grade" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Adicionar unidades" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "−1 grade" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Remover unidades" })).toBeEnabled();

  await page.getByLabel("Quantidade de unidades").fill("1");
  await page.getByRole("button", { name: "Remover unidades" }).click();
  await expect(valorPrincipalDaProducao(page)).toHaveText("19.999");
  await expect(page.getByRole("button", { name: "Adicionar unidades" })).toBeEnabled();
});

test("bloqueia todos os ajustes após uma conclusão forçada abaixo da meta", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/ordens/OS-2026-001");
  await page.getByRole("button", { name: "Forçar conclusão" }).click();
  await page.getByLabel("Justificativa").fill("Encerramento autorizado para teste");
  await page.getByRole("button", { name: "Concluir OS" }).click();
  await page.getByRole("link", { name: "Impressão" }).click();

  await expect(page.getByText("OS concluída. Os contadores estão bloqueados.")).toBeVisible();
  await expect(page.getByRole("button", { name: "+1 grade" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Adicionar unidades" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "−1 grade" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remover unidades" })).toBeDisabled();
  await expect(page.getByLabel("Quantidade de unidades")).toBeDisabled();
});

test("mantém todos os contadores bloqueados em uma OS concluída", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/ordens/OS-2026-003/processos/impressao");

  await expect(page.getByText("OS concluída. Os contadores estão bloqueados.")).toBeVisible();
  await expect(page.getByRole("button", { name: "+1 grade" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Adicionar unidades" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "−1 grade" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remover unidades" })).toBeDisabled();
});

test("mantém download e metadados do arquivo em uma OS concluída", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/ordens/OS-2026-003");

  await page
    .getByRole("table", { name: "Arquivos da Ordem de Serviço" })
    .locator("tbody tr")
    .first()
    .click();
  const previa = page.locator(".file-preview-card");
  await expect(previa.getByText("PDF", { exact: true })).toBeVisible();
  await expect(previa.getByText("Grade")).toBeVisible();
  await expect(previa.getByText("106 × 200 cm")).toBeVisible();
  await expect(previa.getByText("Peso")).toBeVisible();
  await expect(previa.getByText("1,74 MB")).toBeVisible();
  await expect(page.getByRole("button", { name: "Baixar arquivo" })).toBeEnabled();

  const observacao = page.locator(".observacao-os");
  await expect(observacao).toContainText("Produção aprovada sem ressalvas.");
  await expect(observacao).toHaveCSS("border-left-width", "2px");

  await page.getByRole("link", { name: "Impressão" }).click();
  const previaDoProcesso = page.locator(".file-preview-card");
  await expect(previaDoProcesso.getByRole("heading", { name: "Arquivo designado" })).toBeVisible();
  await expect(previaDoProcesso.getByText("106 × 200 cm")).toBeVisible();
  await expect(previaDoProcesso.getByText("1,74 MB")).toBeVisible();
  await expect(previaDoProcesso.getByRole("button", { name: "Baixar arquivo" })).toBeEnabled();
});

test("mostra os três cargos como opções explicativas", async ({ page }) => {
  await page.goto("/#/cadastro");
  await expect(page.getByText("Opera Impressão, Plotagem e Corte")).toBeVisible();
  await expect(page.getByText("Cria candidatos, materiais e Ordens de Serviço")).toBeVisible();
  await expect(page.getByText("Executa todas as funções, monitora a produção")).toBeVisible();
});

test("habilita somente o processo cujo arquivo válido foi selecionado", async ({ page }) => {
  await entrarComoAdministrador(page);
  await page.goto("/#/ordens/nova");

  const seletores = page.getByRole("button", { name: "Selecionar" });
  await seletores.nth(0).click();
  await page.locator(".popup-vue .option-button").first().click();
  await seletores.nth(1).click();
  await page.locator(".popup-vue .option-button").first().click();

  await page
    .locator('input[type="file"]')
    .nth(0)
    .setInputFiles({
      name: "impressao.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("arquivo demonstrativo"),
    });
  await expect(page.locator(".file-upload").nth(0)).toHaveClass(/is-valid/);
  await expect(page.locator(".file-upload").nth(1)).not.toHaveClass(/is-valid/);
  await page.getByRole("button", { name: "Criar Ordem de Serviço" }).click();
  await expect(page).toHaveURL(/#\/ordens\/OS-DEMO-/);
  await expect(page.locator(".stage-tab")).toHaveCount(1);
  await expect(page.locator(".stage-tab")).toHaveText("Impressão");
  await page.getByRole("link", { name: /Ordens/ }).click();
  await expect(page).toHaveURL(/#\/administracao\/resumo$/);
});

test("abre todas as telas migradas sem erro nem rolagem horizontal", async ({ page }) => {
  const erros: string[] = [];
  page.on("console", (mensagem) => {
    if (mensagem.type() === "error") erros.push(mensagem.text());
  });
  await entrarComoAdministrador(page);
  const caminhos = [
    "/#/",
    "/#/cadastro",
    "/#/recuperar-senha",
    "/#/configuracoes",
    "/#/maquinista",
    "/#/designer",
    "/#/historico",
    "/#/ordens/nova",
    "/#/ordens/OS-2026-001",
    "/#/ordens/OS-2026-001/processos/impressao",
    "/#/ordens/OS-2026-001/registros",
    "/#/candidatos/novo",
    "/#/materiais/novo",
    "/#/administracao/menu",
    "/#/administracao/resumo",
    "/#/administracao/painel",
  ];
  for (const caminho of caminhos) {
    await page.goto(caminho);
    await expect(page.locator("main")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `rolagem horizontal em ${caminho}`,
    ).toBe(true);
  }
  expect(erros).toEqual([]);
});
