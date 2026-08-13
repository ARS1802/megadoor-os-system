import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function falhar(mensagem) {
  process.stderr.write(`Erro: ${mensagem}\n`);
  process.exit(1);
}

async function calcularSha256(caminho) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const fluxo = createReadStream(caminho);
    fluxo.on("data", (bloco) => hash.update(bloco));
    fluxo.once("error", reject);
    fluxo.once("end", resolve);
  });
  return hash.digest("hex");
}

async function listarArquivos(raiz, atual = raiz) {
  const entradas = await readdir(atual, { withFileTypes: true });
  entradas.sort((a, b) => a.name.localeCompare(b.name, "en"));
  const arquivos = [];

  for (const entrada of entradas) {
    const caminho = path.join(atual, entrada.name);
    const estado = await lstat(caminho);
    if (estado.isSymbolicLink()) {
      throw new Error(`Links simbólicos não são permitidos no payload: ${caminho}`);
    }
    if (estado.isDirectory()) {
      arquivos.push(...(await listarArquivos(raiz, caminho)));
      continue;
    }
    if (!estado.isFile()) {
      throw new Error(`Entrada não suportada no payload: ${caminho}`);
    }

    const relativo = path.relative(raiz, caminho).split(path.sep).join("/");
    if (relativo === "payload-manifest.json" || relativo === "files.sha256") continue;
    arquivos.push({ caminho, relativo, tamanho: estado.size });
  }

  return arquivos;
}

async function escreverAtomicamente(destino, conteudo) {
  const temporario = `${destino}.${process.pid}.tmp`;
  await writeFile(temporario, conteudo, "utf8");
  await rename(temporario, destino);
}

const [raizInformada, plataforma = "windows-x64"] = process.argv.slice(2);
if (!raizInformada) {
  falhar("Uso: node gerar-manifesto.mjs <diretório-do-payload> [plataforma]");
}

const raizDoProjeto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const caminhoDaConfiguracao = path.join(raizDoProjeto, "packaging/distribution.config.json");
const raizDoPayload = path.resolve(raizInformada);

try {
  const configuracao = JSON.parse(await readFile(caminhoDaConfiguracao, "utf8"));
  const arquivosEncontrados = await listarArquivos(raizDoPayload);
  const arquivos = [];

  for (const arquivo of arquivosEncontrados) {
    arquivos.push({
      path: arquivo.relativo,
      size: arquivo.tamanho,
      sha256: await calcularSha256(arquivo.caminho),
    });
  }

  const revisao = (process.env.MEGADOOR_RELEASE_COMMIT ?? "desenvolvimento").trim();
  const manifest = {
    schemaVersion: configuracao.manifestSchemaVersion,
    application: {
      id: configuracao.application.id,
      name: configuracao.application.name,
      version: configuracao.application.version,
    },
    source: {
      repository: configuracao.repository.url,
      tag: configuracao.repository.releaseTag,
      commit: revisao,
    },
    platform: plataforma,
    runtime: {
      name: "node",
      version: configuracao.runtime.nodeVersion,
    },
    firebase: {
      projectId: configuracao.firebase.projectId,
    },
    configurationSchemaVersion: configuracao.configurationSchemaVersion,
    files: arquivos,
  };

  const manifestPath = path.join(raizDoPayload, "payload-manifest.json");
  const checksumsPath = path.join(raizDoPayload, "files.sha256");
  await escreverAtomicamente(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await escreverAtomicamente(
    checksumsPath,
    `${arquivos.map((arquivo) => `${arquivo.sha256}  ${arquivo.path}`).join("\n")}\n`,
  );

  process.stdout.write(`Manifesto criado com ${arquivos.length} arquivos em ${manifestPath}\n`);
} catch (erro) {
  falhar(erro instanceof Error ? erro.message : String(erro));
}
