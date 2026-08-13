import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REQUIRED_PAYLOAD_FILES = [
  "app/index.html",
  "assets/megadoor-icon.svg",
  "bin/installer-support.mjs",
  "bin/linux-launcher.mjs",
  "bin/megadoor",
  "bin/megadoor-uninstall",
  "runtime/bin/node",
  "runtime/LICENSE",
  "server/static-server.mjs",
  "distribution.config.json",
  "THIRD-PARTY-NOTICES.txt",
];
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(`${field} inválido.`);
  }
  return value;
}

function requireSafeVersion(value, field) {
  const version = requireString(value, field);
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
    fail(`${field} deve seguir o formato semântico.`);
  }
  return version;
}

function validateRelativePath(value) {
  const candidate = requireString(value, "Caminho do manifesto");
  if (
    path.posix.isAbsolute(candidate) ||
    candidate.includes("\\") ||
    candidate.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail(`Caminho inseguro no manifesto: ${candidate}`);
  }
  return candidate;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

async function walkFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) fail(`Link simbólico não permitido no payload: ${absolute}`);
    if (info.isDirectory()) {
      files.push(...(await walkFiles(root, absolute)));
      continue;
    }
    if (!info.isFile()) fail(`Entrada não suportada no payload: ${absolute}`);

    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (relative !== "payload-manifest.json" && relative !== "files.sha256") {
      files.push({ absolute, relative, size: info.size });
    }
  }

  return files;
}

async function validatePayload(rootArgument, expectedPlatform) {
  const root = path.resolve(rootArgument);
  const manifest = JSON.parse(await readFile(path.join(root, "payload-manifest.json"), "utf8"));
  if (!isRecord(manifest) || manifest.schemaVersion !== 1) fail("Manifesto incompatível.");
  if (manifest.platform !== expectedPlatform) fail("O payload pertence a outra plataforma.");
  if (!isRecord(manifest.application)) fail("Aplicação ausente no manifesto.");
  if (manifest.application.id !== "br.com.megadoor.os")
    fail("Identificador da aplicação inválido.");

  const version = requireSafeVersion(manifest.application.version, "Versão da aplicação");
  if (!isRecord(manifest.runtime) || manifest.runtime.name !== "node") {
    fail("Runtime incompatível no manifesto.");
  }
  const runtimeVersion = requireSafeVersion(manifest.runtime.version, "Versão do runtime");
  if (!Number.isInteger(manifest.configurationSchemaVersion)) {
    fail("Versão da configuração inválida.");
  }
  if (!Array.isArray(manifest.files)) fail("Lista de arquivos ausente no manifesto.");

  const declared = new Map();
  for (const item of manifest.files) {
    if (!isRecord(item)) fail("Entrada inválida no manifesto.");
    const relative = validateRelativePath(item.path);
    if (declared.has(relative)) fail(`Arquivo duplicado no manifesto: ${relative}`);
    if (!Number.isInteger(item.size) || item.size < 0) fail(`Tamanho inválido: ${relative}`);
    if (typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      fail(`SHA-256 inválido: ${relative}`);
    }
    declared.set(relative, item);
  }

  const actualFiles = await walkFiles(root);
  if (actualFiles.length !== declared.size) fail("A quantidade de arquivos diverge do manifesto.");

  for (const file of actualFiles) {
    const expected = declared.get(file.relative);
    if (!expected) fail(`Arquivo não declarado: ${file.relative}`);
    if (expected.size !== file.size) fail(`Tamanho divergente: ${file.relative}`);
    if ((await sha256(file.absolute)) !== expected.sha256) {
      fail(`SHA-256 divergente: ${file.relative}`);
    }
  }

  for (const required of REQUIRED_PAYLOAD_FILES) {
    if (!declared.has(required)) fail(`Componente obrigatório ausente: ${required}`);
  }

  const nodeInfo = await stat(path.join(root, "runtime/bin/node"));
  if (!nodeInfo.isFile()) fail("O runtime Node privado é inválido.");

  process.stdout.write(
    `${version}\n${runtimeVersion}\n${manifest.configurationSchemaVersion}\n${manifest.application.id}\n`,
  );
}

function quoteDesktopValue(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("$", "\\$").replaceAll('"', '\\"')}"`;
}

async function writeAtomic(filePath, contents, mode = 0o600) {
  const directory = path.dirname(filePath);
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.tmp`);
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, contents, { encoding: "utf8", mode });
  await rm(filePath, { force: true });
  await rename(temporary, filePath);
}

async function writeDesktop(args) {
  const [filePath, name, comment, executable, icon, installId, terminalValue] = args;
  for (const [value, field] of [
    [filePath, "Arquivo desktop"],
    [name, "Nome desktop"],
    [comment, "Comentário desktop"],
    [executable, "Executável desktop"],
    [icon, "Ícone desktop"],
    [installId, "ID da instalação"],
  ]) {
    requireString(value, field);
  }
  if (!INSTALLATION_ID_PATTERN.test(installId)) fail("ID da instalação inválido.");
  if (terminalValue !== "true" && terminalValue !== "false") fail("Terminal inválido.");

  const contents = [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    `Name=${name}`,
    `Comment=${comment}`,
    `Exec=${quoteDesktopValue(executable)}`,
    `Icon=${icon}`,
    `Terminal=${terminalValue}`,
    "Categories=Office;Utility;",
    "StartupNotify=true",
    `X-Megadoor-Install-Id=${installId}`,
    "",
  ].join("\n");

  await writeAtomic(path.resolve(filePath), contents, 0o755);
}

async function writeInstallState(args) {
  const [
    filePath,
    installId,
    version,
    runtimeVersion,
    installRoot,
    configRoot,
    stateRoot,
    launcherLink,
    uninstallerLink,
    desktopFile,
    desktopShortcut,
    iconFile,
    localApplicationPort,
    configurationSchemaVersion,
  ] = args;

  for (const [value, field] of [
    [filePath, "Arquivo de estado"],
    [installId, "ID da instalação"],
    [installRoot, "Raiz da instalação"],
    [configRoot, "Raiz da configuração"],
    [stateRoot, "Raiz do estado"],
    [launcherLink, "Atalho do launcher"],
    [uninstallerLink, "Atalho do desinstalador"],
    [desktopFile, "Entrada desktop"],
    [iconFile, "Ícone"],
  ]) {
    requireString(value, field);
  }

  const state = {
    schemaVersion: 1,
    installationId: installId,
    application: { id: "br.com.megadoor.os", name: "Megadoor", version },
    platform: "linux-x64",
    activeVersion: requireSafeVersion(version, "Versão ativa"),
    localApplicationPort: Number(localApplicationPort),
    configurationSchemaVersion: Number(configurationSchemaVersion),
    installedAt: new Date().toISOString(),
    runtime: { name: "node", version: requireSafeVersion(runtimeVersion, "Versão do runtime") },
    paths: {
      installRoot: path.resolve(installRoot),
      configRoot: path.resolve(configRoot),
      stateRoot: path.resolve(stateRoot),
      launcherLink: path.resolve(launcherLink),
      uninstallerLink: path.resolve(uninstallerLink),
      desktopFile: path.resolve(desktopFile),
      desktopShortcut: desktopShortcut ? path.resolve(desktopShortcut) : null,
      iconFile: path.resolve(iconFile),
    },
  };

  if (
    !Number.isInteger(state.localApplicationPort) ||
    state.localApplicationPort < 1 ||
    state.localApplicationPort > 65_535 ||
    !Number.isInteger(state.configurationSchemaVersion) ||
    state.configurationSchemaVersion < 1
  ) {
    fail("Constantes operacionais inválidas para o estado da instalação.");
  }

  await writeAtomic(path.resolve(filePath), `${JSON.stringify(state, null, 2)}\n`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "validate-payload" && args.length === 2) {
    await validatePayload(args[0], args[1]);
    return;
  }
  if (command === "write-desktop" && args.length === 7) {
    await writeDesktop(args);
    return;
  }
  if (command === "write-install-state" && args.length === 14) {
    await writeInstallState(args);
    return;
  }
  fail("Comando ou quantidade de argumentos inválida.");
}

main().catch((error) => {
  process.stderr.write(`Erro: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
