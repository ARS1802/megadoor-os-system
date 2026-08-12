import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  capturarCredencialDaContaReal,
  limparRecursosDaExecucaoReal,
  type EstadoDaExecucaoReal,
} from "./suporteDaExecucaoReal";

const uuidDaExecucao = randomUUID();
const marcador = uuidDaExecucao.replaceAll("-", "").toLowerCase();

function criarEstado(sufixo: "designer" | "admin"): EstadoDaExecucaoReal {
  const identificador = `${marcador}-${sufixo}`;
  return {
    marcador: identificador,
    nomeDoUsuario: `E2E Real ${sufixo} ${marcador}`,
    email: `e2e.real.${sufixo}.${marcador}@example.com`,
    senha: `Megadoor-${marcador.slice(0, 12)}-Aa1!`,
    nomeDoCandidato: `Candidato E2E Real ${identificador}`,
    nomeDoMaterial: `Material E2E Real ${identificador}`,
    nomeDoArquivoInicial: `impressao-${identificador}.pdf`,
    nomeDoArquivoCorrigido: `impressao-corrigida-${identificador}.pdf`,
  };
}

const estadoDesigner = criarEstado("designer");
const estadoAdministrador = criarEstado("admin");
const estadosDaExecucao = [estadoDesigner, estadoAdministrador];
const contextosExtras = new Set<BrowserContext>();
const CABECALHO_CSV =
  '"data_hora","evento","id_da_operacao","nome_do_usuario","processo","tipo_do_contador","sentido","unidades_adicionadas_ou_removidas","justificativa","impressao_unidades_produzidas","impressao_unidades_faltantes","plotagem_unidades_produzidas","plotagem_unidades_faltantes","corte_unidades_produzidas","corte_unidades_faltantes","nome_do_arquivo_anterior","caminho_do_arquivo_anterior","nome_do_arquivo_novo","caminho_do_arquivo_novo","registro_original"';

const imagemPngDeUmPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function configurarFastApi(page: Page): Promise<void> {
  const enderecoFastApi = new URL(process.env.MEGADOOR_FASTAPI_TEST_URL!);
  await page.addInitScript(
    ({ endereco, porta }) => {
      localStorage.setItem("megadoor-configuracao-servidor", JSON.stringify({ endereco, porta }));
    },
    {
      endereco: enderecoFastApi.hostname,
      porta: Number(enderecoFastApi.port || "8443"),
    },
  );
}

async function criarConta(
  page: Page,
  request: APIRequestContext,
  estado: EstadoDaExecucaoReal,
  cargo: "DESIGNER" | "ADMIN",
): Promise<void> {
  await page.goto("/#/cadastro");
  await page.getByLabel("Nome", { exact: true }).fill(estado.nomeDoUsuario);
  await page.getByLabel("E-mail").fill(estado.email);
  await page.getByLabel("Senha", { exact: true }).fill(estado.senha);
  await page.getByLabel("Confirmar senha").fill(estado.senha);
  await page.locator(`input[type="radio"][value="${cargo}"]`).check({ force: true });

  if (cargo === "ADMIN") {
    const popup = page.getByRole("dialog", { name: "Senha administrativa" });
    await popup.getByLabel("Senha administrativa").fill("m6e9g6a9");
    await popup.getByRole("button", { name: "Confirmar" }).click();
  }

  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(cargo === "ADMIN" ? /#\/administracao\/resumo$/ : /#\/designer$/);
  await capturarCredencialDaContaReal(request, estado);
}

async function entrar(page: Page, estado: EstadoDaExecucaoReal, destino: RegExp): Promise<void> {
  await page.goto("/#/");
  await page.getByLabel("E-mail").fill(estado.email);
  await page.getByLabel("Senha", { exact: true }).fill(estado.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(destino);
}

async function cadastrarCandidato(
  page: Page,
  estado: EstadoDaExecucaoReal,
  retorno: string,
): Promise<void> {
  await page.goto(`/#/candidatos/novo?retorno=${encodeURIComponent(retorno)}`);
  await page.getByLabel("Nome", { exact: true }).fill(estado.nomeDoCandidato);
  await page.getByLabel("Partido (opcional)").fill(`Partido ${estado.marcador.slice(0, 8)}`);
  await page.getByLabel("Número").fill("12.345.678/0001-90");
  await page
    .getByLabel("Observações (opcional)")
    .fill(`Criado exclusivamente pelo teste ${estado.marcador}.`);
  const cadastrar = page.getByRole("button", { name: "Cadastrar candidato" });
  await expect(cadastrar).toBeEnabled();
  await cadastrar.click();
  await expect(page).toHaveURL(new RegExp(`#${retorno.replaceAll("/", "\\/")}$`));
}

async function cadastrarMaterial(
  page: Page,
  estado: EstadoDaExecucaoReal,
  retorno: string,
): Promise<void> {
  await page.goto(`/#/materiais/novo?retorno=${encodeURIComponent(retorno)}`);
  await page.getByLabel("Nome diferente").fill(estado.nomeDoMaterial);
  await page.getByLabel("Marca").fill(`Marca ${estado.marcador.slice(0, 8)}`);
  await page.getByLabel("Largura (cm)").fill("106");
  await page.getByLabel("Comprimento (cm)").fill("5000");
  await page.getByLabel("Gramatura (opcional)").fill("180");
  await page.getByLabel("Imagem da etiqueta (opcional)").setInputFiles({
    name: `etiqueta-${estado.marcador}.png`,
    mimeType: "image/png",
    buffer: imagemPngDeUmPixel,
  });
  await expect(page.locator(".material-label-photo")).toHaveClass(/is-valid/);
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page).toHaveURL(new RegExp(`#${retorno.replaceAll("/", "\\/")}$`));
}

async function criarOrdem(
  page: Page,
  estado: EstadoDaExecucaoReal,
  retorno: string,
  quantidadeTotal: number,
): Promise<void> {
  await page.goto(`/#/ordens/nova?retorno=${encodeURIComponent(retorno)}`);

  await page.getByRole("button", { name: "Selecionar" }).nth(0).click();
  await page
    .getByRole("dialog", { name: "Candidatos" })
    .locator(".option-button")
    .filter({ hasText: estado.nomeDoCandidato })
    .click();

  await page.getByRole("button", { name: "Selecionar" }).nth(1).click();
  await page
    .getByRole("dialog", { name: "Materiais" })
    .locator(".option-button")
    .filter({ hasText: estado.nomeDoMaterial })
    .click();

  await page.locator("#unit-width").fill("10");
  await page.locator("#unit-height").fill("20");
  await page.locator("#quantity").fill(String(quantidadeTotal));
  await page.locator("#print-run").fill("1");
  await page.locator("#grade-width").fill("100");
  await page.locator("#grade-height").fill("200");
  await page.locator("#units-grade").fill("2");
  await page
    .getByLabel("Texto de observacao.txt")
    .fill(`Observação exclusiva da execução E2E real ${estado.marcador}.`);
  await page.getByLabel("Arquivo de impressão").setInputFiles({
    name: estado.nomeDoArquivoInicial,
    mimeType: "application/pdf",
    buffer: Buffer.from(`%PDF-1.4\n% E2E real ${estado.marcador}\n%%EOF\n`),
  });

  const criar = page.getByRole("button", { name: "Criar Ordem de Serviço" });
  await expect(criar).toBeEnabled();
  await criar.click();
  await page.waitForURL((url) => {
    const id = url.hash.match(/^#\/ordens\/([^/?]+)/)?.[1];
    return Boolean(id && id !== "nova");
  });
  const correspondencia = new URL(page.url()).hash.match(/^#\/ordens\/([^/?]+)/);
  if (!correspondencia?.[1]) throw new Error("A interface não informou o ID da OS criada.");
  estado.idDaOrdem = decodeURIComponent(correspondencia[1]);

  await expect(
    page.getByRole("heading", { name: "Informações da Ordem de Serviço" }),
  ).toBeVisible();
  await expect(
    page.getByText(`Observação exclusiva da execução E2E real ${estado.marcador}.`),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: estado.nomeDoMaterial })).toBeVisible();
}

async function exportarCsv(page: Page): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar CSV" }).click(),
  ]);
  const caminho = await download.path();
  if (!caminho) throw new Error("O navegador não disponibilizou o CSV exportado.");
  return readFile(caminho, "utf8");
}

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page, request }) => {
  const falhas: unknown[] = [];

  for (const contexto of contextosExtras) {
    try {
      await contexto.close();
    } catch (falha) {
      falhas.push(falha);
    }
  }
  contextosExtras.clear();

  try {
    await page.close();
  } catch (falha) {
    falhas.push(falha);
  }

  // Limpa todos os marcadores mesmo se um fluxo anterior falhar no meio. Cada
  // estado possui nomes, conta e referências próprios, validados pelo suporte.
  for (const estado of estadosDaExecucao) {
    try {
      await limparRecursosDaExecucaoReal(request, estado);
    } catch (falha) {
      falhas.push(falha);
    }
  }

  if (falhas.length) throw new AggregateError(falhas, "A limpeza do E2E real não foi concluída.");
});

test("conclui normalmente uma OS com ajustes concorrentes e reupload", async ({
  page,
  request,
  browser,
}) => {
  await configurarFastApi(page);

  await test.step("criar conta, candidato, material e OS como Designer", async () => {
    await criarConta(page, request, estadoDesigner, "DESIGNER");
    // Confirma que o observer do Firebase restaura a sessão após um reload e,
    // em seguida, valida o ciclo explícito de logout/login antes das mutações.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/#\/designer$/);
    await expect(page.getByRole("heading", { name: "Ordens de Serviço" })).toBeVisible();
    await page.getByRole("link", { name: /Configurações/ }).click();
    await page.getByRole("button", { name: "Desconectar" }).click();
    await expect(page).toHaveURL(/\/#\/$/);
    await entrar(page, estadoDesigner, /#\/designer$/);
    await cadastrarCandidato(page, estadoDesigner, "/designer");
    await cadastrarMaterial(page, estadoDesigner, "/designer");
    await criarOrdem(page, estadoDesigner, "/designer", 10);
  });

  await test.step("somar ajustes feitos por duas sessões independentes", async () => {
    await page.getByRole("link", { name: "Impressão", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Produção de impressão/i })).toBeVisible();

    const contextoSecundario = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 720 },
    });
    contextosExtras.add(contextoSecundario);
    const paginaSecundaria = await contextoSecundario.newPage();
    await configurarFastApi(paginaSecundaria);
    await entrar(paginaSecundaria, estadoDesigner, /#\/designer$/);
    await paginaSecundaria.goto(
      `/#/ordens/${encodeURIComponent(estadoDesigner.idDaOrdem!)}/processos/impressao?retorno=/designer`,
    );
    await expect(
      paginaSecundaria.getByRole("heading", { name: /Produção de impressão/i }),
    ).toBeVisible();

    await Promise.all([
      page.getByLabel("Quantidade de unidades").fill("2"),
      paginaSecundaria.getByLabel("Quantidade de unidades").fill("2"),
    ]);
    await Promise.all([
      page.getByRole("button", { name: "Adicionar unidades" }).click(),
      paginaSecundaria.getByRole("button", { name: "Adicionar unidades" }).click(),
    ]);

    await expect(page.locator(".meter-value span")).toHaveText("4");
    await expect(paginaSecundaria.locator(".meter-value span")).toHaveText("4");
    await contextoSecundario.close();
    contextosExtras.delete(contextoSecundario);
  });

  await test.step("substituir o arquivo antes da conclusão", async () => {
    await page.getByRole("link", { name: /Detalhes/ }).click();
    await page
      .getByRole("table", { name: "Arquivos da Ordem de Serviço" })
      .locator("tbody tr")
      .first()
      .click();
    const escolherArquivo = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Reupload" }).click();
    await (
      await escolherArquivo
    ).setFiles({
      name: estadoDesigner.nomeDoArquivoCorrigido,
      mimeType: "application/pdf",
      buffer: Buffer.from(`%PDF-1.4\n% Correção E2E real ${estadoDesigner.marcador}\n%%EOF\n`),
    });
    await expect(
      page
        .locator(".file-preview-card")
        .getByText(estadoDesigner.nomeDoArquivoCorrigido, { exact: true }),
    ).toBeVisible();
  });

  await test.step("atingir a meta e bloquear novos ajustes", async () => {
    await page.getByRole("link", { name: "Impressão", exact: true }).click();
    await page.getByLabel("Quantidade de unidades").fill("6");
    await page.getByRole("button", { name: "Adicionar unidades" }).click();
    await expect(page.locator(".meter-value span")).toHaveText("10");
    await expect(page.getByText("OS concluída. Os contadores estão bloqueados.")).toBeVisible();
    await expect(page.getByRole("button", { name: "+1 grade" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Adicionar unidades" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "−1 grade" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Remover unidades" })).toBeDisabled();
  });

  await test.step("ler a auditoria completa e exportar seu CSV", async () => {
    await page.getByRole("link", { name: "Abrir registros" }).click();
    const leitor = page.getByRole("log");
    await expect(leitor.locator(".registro").filter({ hasText: "UNIDADES=+2" })).toHaveCount(2);
    await expect(leitor).toContainText("UNIDADES=+6");
    await expect(leitor).toContainText("EVENTO=ARQUIVO_SUBSTITUIDO");
    await expect(leitor).toContainText(`USUARIO=${estadoDesigner.nomeDoUsuario}`);
    await expect(leitor).toContainText(`ARQUIVO_NOVO=${estadoDesigner.nomeDoArquivoCorrigido}`);

    const csv = await exportarCsv(page);
    expect(csv).toContain(CABECALHO_CSV);
    expect(csv.match(/"AJUSTE_PRODUCAO"/g)).toHaveLength(3);
    expect(csv).toContain('"ARQUIVO_SUBSTITUIDO"');
    expect(csv).toContain(estadoDesigner.nomeDoArquivoCorrigido);
  });
});

test("permite ao Administrador forçar conclusão com justificativa e auditoria", async ({
  page,
  request,
}) => {
  await configurarFastApi(page);

  await test.step("criar recursos descartáveis por uma conta Administrador", async () => {
    await criarConta(page, request, estadoAdministrador, "ADMIN");
    await cadastrarCandidato(page, estadoAdministrador, "/administracao/resumo");
    await cadastrarMaterial(page, estadoAdministrador, "/administracao/resumo");
    await criarOrdem(page, estadoAdministrador, "/administracao/resumo", 10);
  });

  await test.step("iniciar a produção e forçar a conclusão abaixo da meta", async () => {
    await page.getByRole("link", { name: "Impressão", exact: true }).click();
    await page.getByLabel("Quantidade de unidades").fill("2");
    await page.getByRole("button", { name: "Adicionar unidades" }).click();
    await expect(page.locator(".meter-value span")).toHaveText("2");

    await page.getByRole("link", { name: /Detalhes/ }).click();
    await page.getByRole("button", { name: "Forçar conclusão" }).click();
    const popup = page.getByRole("dialog", { name: "Forçar conclusão" });
    const justificativa = `Conclusão administrativa E2E ${estadoAdministrador.marcador}`;
    await popup.getByLabel("Justificativa").fill(justificativa);
    await popup.getByRole("button", { name: "Concluir OS" }).click();
    await expect(page.locator(".status-symbol")).toHaveText("Concluída");

    await page.getByRole("link", { name: "Impressão", exact: true }).click();
    await expect(page.getByText("OS concluída. Os contadores estão bloqueados.")).toBeVisible();
    await expect(page.getByLabel("Quantidade de unidades")).toBeDisabled();
    await expect(page.getByRole("button", { name: "+1 grade" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Adicionar unidades" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "−1 grade" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Remover unidades" })).toBeDisabled();
  });

  await test.step("validar a linha de conclusão forçada e o CSV", async () => {
    await page.getByRole("link", { name: "Abrir registros" }).click();
    const justificativa = `Conclusão administrativa E2E ${estadoAdministrador.marcador}`;
    const ultimaLinha = page.locator(".registro").last();
    await expect(ultimaLinha).toContainText("EVENTO=CONCLUSAO_FORCADA");
    await expect(ultimaLinha).toContainText(`USUARIO=${estadoAdministrador.nomeDoUsuario}`);
    await expect(ultimaLinha).toContainText(`JUSTIFICATIVA=${justificativa}`);
    await expect(ultimaLinha).toContainText("IMPRESSAO_PRODUZIDAS=2");
    await expect(ultimaLinha).toContainText("IMPRESSAO_FALTANTES=8");

    const csv = await exportarCsv(page);
    expect(csv).toContain(CABECALHO_CSV);
    expect(csv).toContain('"CONCLUSAO_FORCADA"');
    expect(csv).toContain(justificativa);
    expect(csv).toContain('"2","8"');
  });
});
