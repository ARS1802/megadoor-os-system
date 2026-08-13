import { createReadStream } from "node:fs";
import { access, realpath, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";

const RAIZ_DA_INSTALACAO = path.resolve(process.argv[2] ?? process.cwd());
const RAIZ_DA_APLICACAO = path.join(RAIZ_DA_INSTALACAO, "app");
const PORTA = Number.parseInt(process.env.MEGADOOR_PORTA_LOCAL ?? "41731", 10);
const ENDERECO = "127.0.0.1";
const CAMINHO_DO_ESTADO = path.join(RAIZ_DA_INSTALACAO, "server-state.json");

if (!Number.isSafeInteger(PORTA) || PORTA < 1024 || PORTA > 65_535) {
  throw new Error("A porta local do Megadoor é inválida.");
}

const tipos = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

const raizReal = await realpath(RAIZ_DA_APLICACAO);
await access(path.join(raizReal, "index.html"));

async function resolverArquivo(caminhoDaUrl) {
  let caminhoDecodificado;
  try {
    caminhoDecodificado = decodeURIComponent(caminhoDaUrl);
  } catch {
    return null;
  }

  const caminhoRelativo = caminhoDecodificado.replace(/^\/+/, "");
  const candidato = path.resolve(raizReal, caminhoRelativo || "index.html");
  if (candidato !== raizReal && !candidato.startsWith(`${raizReal}${path.sep}`)) return null;

  try {
    const dados = await stat(candidato);
    if (!dados.isFile()) return null;
    const candidatoReal = await realpath(candidato);
    if (candidatoReal !== raizReal && !candidatoReal.startsWith(`${raizReal}${path.sep}`)) {
      return null;
    }
    return { caminho: candidatoReal, tamanho: dados.size };
  } catch {
    return null;
  }
}

const servidor = createServer(async (requisicao, resposta) => {
  try {
    if (requisicao.method !== "GET" && requisicao.method !== "HEAD") {
      resposta.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }

    const url = new URL(requisicao.url ?? "/", `http://${ENDERECO}:${PORTA}`);
    if (url.pathname === "/.megadoor/health") {
      const corpo = JSON.stringify({ status: "ok", pid: process.pid });
      resposta
        .writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Length": Buffer.byteLength(corpo),
          "Content-Type": "application/json; charset=utf-8",
        })
        .end(requisicao.method === "HEAD" ? undefined : corpo);
      return;
    }

    let arquivo = await resolverArquivo(url.pathname);
    if (!arquivo) arquivo = await resolverArquivo("/index.html");
    if (!arquivo) {
      resposta.writeHead(404).end("Aplicação não encontrada.");
      return;
    }

    const extensao = path.extname(arquivo.caminho).toLowerCase();
    resposta.writeHead(200, {
      "Cache-Control":
        extensao === ".html" || extensao === ".json"
          ? "no-store"
          : "public, max-age=31536000, immutable",
      "Content-Length": arquivo.tamanho,
      "Content-Type": tipos.get(extensao) ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (requisicao.method === "HEAD") resposta.end();
    else createReadStream(arquivo.caminho).pipe(resposta);
  } catch (erro) {
    console.error(erro);
    if (!resposta.headersSent) resposta.writeHead(500);
    resposta.end("Falha ao servir o Megadoor.");
  }
});

servidor.on("error", (erro) => {
  console.error(erro);
  process.exitCode = 1;
});

servidor.listen(PORTA, ENDERECO, async () => {
  await writeFile(
    CAMINHO_DO_ESTADO,
    `${JSON.stringify({ pid: process.pid, port: PORTA, startedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Megadoor disponível em http://${ENDERECO}:${PORTA}`);
});
