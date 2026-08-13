import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const raizDoProjeto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const destino = process.argv[2] ? path.resolve(process.argv[2]) : null;

if (!destino) {
  throw new Error("Uso: node gerar-avisos-de-terceiros.mjs <arquivo-de-destino>");
}

const textosAlternativos = {
  MIT: "node_modules/vue/LICENSE",
  "Apache-2.0": "node_modules/typescript/LICENSE.txt",
  "BSD-2-Clause": "node_modules/entities/LICENSE",
  "BSD-3-Clause": "node_modules/protobufjs/LICENSE",
  ISC: "node_modules/idb/LICENSE",
  "0BSD": "node_modules/tslib/LICENSE.txt",
};

function repositorioDoPacote(pacote) {
  const repositorio =
    typeof pacote.repository === "string" ? pacote.repository : pacote.repository?.url;
  return (
    repositorio?.replace(/^git\+/, "").replace(/\.git$/, "") ?? pacote.homepage ?? "não informado"
  );
}

async function localizarLicenca(diretorio, identificador) {
  const entradas = await readdir(diretorio);
  const nome = entradas
    .filter((entrada) => /^(licen[cs]e|copying)(\..*)?$/i.test(entrada))
    .sort((a, b) => a.localeCompare(b, "en"))[0];
  if (nome && (await stat(path.join(diretorio, nome))).isFile()) {
    return readFile(path.join(diretorio, nome), "utf8");
  }

  const alternativa = textosAlternativos[identificador];
  if (!alternativa) throw new Error(`Não há texto de licença para ${identificador}.`);
  return readFile(path.join(raizDoProjeto, alternativa), "utf8");
}

const lock = JSON.parse(await readFile(path.join(raizDoProjeto, "package-lock.json"), "utf8"));
const pacotesUnicos = new Map();

for (const [caminhoRelativo, dadosDoLock] of Object.entries(lock.packages ?? {})) {
  if (!caminhoRelativo || dadosDoLock.dev === true || !caminhoRelativo.includes("node_modules/")) {
    continue;
  }

  const diretorio = path.join(raizDoProjeto, caminhoRelativo);
  const pacote = JSON.parse(await readFile(path.join(diretorio, "package.json"), "utf8"));
  const identificador = String(pacote.license ?? "").trim();
  if (!Object.hasOwn(textosAlternativos, identificador)) {
    throw new Error(
      `${pacote.name}@${pacote.version} possui licença não mapeada: ${identificador}.`,
    );
  }

  const chave = `${pacote.name}@${pacote.version}`;
  if (!pacotesUnicos.has(chave)) {
    pacotesUnicos.set(chave, {
      chave,
      identificador,
      repositorio: repositorioDoPacote(pacote),
      texto: (await localizarLicenca(diretorio, identificador)).trim(),
    });
  }
}

const pacotes = [...pacotesUnicos.values()].sort((a, b) => a.chave.localeCompare(b.chave, "en"));
const grupos = new Map();
for (const pacote of pacotes) {
  const hash = createHash("sha256").update(pacote.texto).digest("hex");
  const chaveDoGrupo = `${pacote.identificador}:${hash}`;
  const grupo = grupos.get(chaveDoGrupo) ?? {
    identificador: pacote.identificador,
    texto: pacote.texto,
    pacotes: [],
  };
  grupo.pacotes.push(pacote.chave);
  grupos.set(chaveDoGrupo, grupo);
}

const linhas = [
  "AVISOS E LICENÇAS DE TERCEIROS DO MEGADOOR",
  "",
  "Este arquivo é gerado a partir das dependências de produção fixadas em package-lock.json.",
  "O código do Megadoor não altera os termos das bibliotecas listadas abaixo.",
  "",
  "INVENTÁRIO",
  "",
  ...pacotes.map((pacote) => `- ${pacote.chave} | ${pacote.identificador} | ${pacote.repositorio}`),
  "",
  "TEXTOS DAS LICENÇAS",
  "",
];

for (const grupo of [...grupos.values()].sort((a, b) =>
  `${a.identificador}:${a.pacotes[0]}`.localeCompare(`${b.identificador}:${b.pacotes[0]}`, "en"),
)) {
  linhas.push("=".repeat(80));
  linhas.push(`Licença: ${grupo.identificador}`);
  linhas.push(`Aplicável a: ${grupo.pacotes.join(", ")}`);
  linhas.push("=".repeat(80));
  linhas.push(grupo.texto);
  linhas.push("");
}

await writeFile(destino, `${linhas.join("\n")}\n`, "utf8");
process.stdout.write(`Avisos de ${pacotes.length} dependências gravados em ${destino}\n`);
