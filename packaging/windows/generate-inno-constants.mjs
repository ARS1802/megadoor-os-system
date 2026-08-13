import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const windowsDirectory = dirname(fileURLToPath(import.meta.url));
const packagingDirectory = resolve(windowsDirectory, "..");
const repositoryDirectory = resolve(packagingDirectory, "..");
const configurationPath = resolve(packagingDirectory, "distribution.config.json");
const outputPath = resolve(windowsDirectory, "generated", "Constants.iss");

const configuration = JSON.parse(await readFile(configurationPath, "utf8"));
const viteEnvironment = {
  ...loadEnv("production", repositoryDirectory, "VITE_"),
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("VITE_"))),
};

const requiredStrings = [
  ["application.id", configuration.application?.id],
  ["application.name", configuration.application?.name],
  ["application.publisher", configuration.application?.publisher],
  ["application.version", configuration.application?.version],
  ["repository.url", configuration.repository?.url],
  ["repository.releaseTag", configuration.repository?.releaseTag],
  ["runtime.nodeVersion", configuration.runtime?.nodeVersion],
  ["windows.architecture", configuration.windows?.architecture],
  ["windows.installDirectoryName", configuration.windows?.installDirectoryName],
  ["windows.innoSetupVersion", configuration.windows?.innoSetupVersion],
  ["firebase.projectId", configuration.firebase?.projectId],
];

for (const [name, value] of requiredStrings) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Constante obrigatória ausente: ${name}`);
  }
}

const requiredIntegers = [
  ["schemaVersion", configuration.schemaVersion],
  ["configurationSchemaVersion", configuration.configurationSchemaVersion],
  ["manifestSchemaVersion", configuration.manifestSchemaVersion],
  ["windows.localApplicationPort", configuration.windows?.localApplicationPort],
  ["server.defaultPort", configuration.server?.defaultPort],
];

for (const [name, value] of requiredIntegers) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Constante inteira inválida: ${name}`);
  }
}

if (configuration.windows.architecture !== "x64") {
  throw new Error("A primeira distribuição Windows suporta somente a arquitetura x64.");
}

if (viteEnvironment.VITE_MODO_APLICACAO?.trim().toUpperCase() !== "REAL") {
  throw new Error("O instalador somente pode ser gerado com VITE_MODO_APLICACAO=REAL.");
}

if (viteEnvironment.VITE_USAR_EMULADORES?.trim().toLowerCase() !== "false") {
  throw new Error("O instalador não pode apontar para os emuladores Firebase.");
}

if (viteEnvironment.VITE_FIREBASE_PROJECT_ID !== configuration.firebase.projectId) {
  throw new Error("VITE_FIREBASE_PROJECT_ID diverge do projeto definido para distribuição.");
}

const firebaseWebApiKey = viteEnvironment.VITE_FIREBASE_API_KEY?.trim();
if (!firebaseWebApiKey) {
  throw new Error("VITE_FIREBASE_API_KEY é obrigatória para validar o Firebase no instalador.");
}

const firebaseProjectNumber = viteEnvironment.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim();
if (!firebaseProjectNumber || !/^\d+$/.test(firebaseProjectNumber)) {
  throw new Error("VITE_FIREBASE_MESSAGING_SENDER_ID precisa ser um número de projeto Firebase.");
}

const packageJson = JSON.parse(
  await readFile(resolve(repositoryDirectory, "package.json"), "utf8"),
);

if (packageJson.version !== configuration.application.version) {
  throw new Error(
    `Versão divergente: package.json=${packageJson.version}, distribuição=${configuration.application.version}`,
  );
}

function git(...arguments_) {
  return execFileSync("git", arguments_, {
    cwd: repositoryDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const releaseCommit = process.env.MEGADOOR_RELEASE_COMMIT?.trim() || git("rev-parse", "HEAD");

if (!/^[0-9a-f]{40}$/i.test(releaseCommit)) {
  throw new Error("MEGADOOR_RELEASE_COMMIT precisa ser um SHA Git completo de 40 caracteres.");
}

if (process.env.MEGADOOR_ALLOW_DIRTY_RELEASE !== "1") {
  const status = git("status", "--porcelain", "--untracked-files=all");
  if (status !== "") {
    throw new Error(
      "O worktree possui alterações. Gere a release a partir de um commit limpo ou use MEGADOOR_ALLOW_DIRTY_RELEASE=1 apenas para validação local.",
    );
  }
}

function innoString(value) {
  return String(value).replaceAll('"', '""');
}

const values = {
  DistributionSchemaVersion: configuration.schemaVersion,
  ApplicationId: configuration.application.id,
  ApplicationName: configuration.application.name,
  ApplicationPublisher: configuration.application.publisher,
  ApplicationVersion: configuration.application.version,
  RepositoryUrl: configuration.repository.url,
  ReleaseTag: configuration.repository.releaseTag,
  ReleaseCommit: releaseCommit.toLowerCase(),
  NodeVersion: configuration.runtime.nodeVersion,
  WindowsArchitecture: configuration.windows.architecture,
  LocalApplicationPort: configuration.windows.localApplicationPort,
  InstallDirectoryName: configuration.windows.installDirectoryName,
  RequiredInnoSetupVersion: configuration.windows.innoSetupVersion,
  FirebaseProjectId: configuration.firebase.projectId,
  FirebaseWebApiKey: firebaseWebApiKey,
  FirebaseProjectNumber: firebaseProjectNumber,
  DefaultServerPort: configuration.server.defaultPort,
  ConfigurationSchemaVersion: configuration.configurationSchemaVersion,
  ManifestSchemaVersion: configuration.manifestSchemaVersion,
};

const definitions = Object.entries(values).map(([name, value]) => {
  if (typeof value === "number") return `#define ${name} ${value}`;
  return `#define ${name} "${innoString(value)}"`;
});

const output = [
  "; Gerado por generate-inno-constants.mjs. Não edite manualmente.",
  ...definitions,
  "",
].join("\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, "utf8");

process.stdout.write(`Constantes do Inno Setup geradas em ${outputPath}\n`);
