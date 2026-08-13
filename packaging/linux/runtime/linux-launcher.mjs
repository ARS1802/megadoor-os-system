import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, open, readFile, realpath, rm } from "node:fs/promises";
import { isIPv4 } from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HEALTH_PATH = "/__megadoor/health";
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

function xdgPath(variable, fallback) {
  const informed = process.env[variable];
  return informed && path.isAbsolute(informed) ? informed : path.join(os.homedir(), fallback);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function validateRuntimeConfig(value, expectedSchemaVersion, expectedInstallationId) {
  if (!isRecord(value) || value.schemaVersion !== expectedSchemaVersion) {
    throw new Error("Configuração de runtime incompatível.");
  }
  if (value.installationId !== expectedInstallationId) {
    throw new Error("A configuração pertence a outra instalação.");
  }
  if (
    !isRecord(value.server) ||
    typeof value.server.address !== "string" ||
    !isIPv4(value.server.address) ||
    !Number.isInteger(value.server.port) ||
    value.server.port < 1 ||
    value.server.port > 65_535
  ) {
    throw new Error("Servidor de arquivos inválido na configuração de runtime.");
  }
  return value;
}

async function waitForSpawn(child) {
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
}

async function notify(title, message, error = false) {
  const options = [
    {
      command: "notify-send",
      args: [error ? "--urgency=critical" : "--urgency=normal", title, message],
    },
    {
      command: "zenity",
      args: [error ? "--error" : "--warning", `--title=${title}`, `--text=${message}`],
    },
    { command: "xmessage", args: ["-center", `${title}\n\n${message}`] },
  ];

  for (const option of options) {
    try {
      const child = spawn(option.command, option.args, { detached: true, stdio: "ignore" });
      await waitForSpawn(child);
      child.unref();
      return;
    } catch {
      // Tenta o próximo mecanismo gráfico disponível.
    }
  }
}

async function fetchHealth(origin, expectedInstallId, timeout = 1_000) {
  try {
    const response = await fetch(`${origin}${HEALTH_PATH}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) return null;
    const value = await response.json();
    if (!isRecord(value) || value.status !== "ok" || value.installId !== expectedInstallId) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

async function waitForLocalServer(origin, expectedInstallId, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const health = await fetchHealth(origin, expectedInstallId, 500);
    if (health) return health;
    if (child.exitCode !== null)
      throw new Error("O servidor local encerrou durante a inicialização.");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("O servidor local não respondeu dentro do prazo esperado.");
}

async function openBrowser(origin) {
  const child = spawn("xdg-open", [origin], { detached: true, stdio: "ignore" });
  await waitForSpawn(child);
  child.unref();
}

async function checkFastApi(runtimeConfig) {
  try {
    const response = await fetch(
      `https://${runtimeConfig.server.address}:${runtimeConfig.server.port}/health`,
      { cache: "no-store", signal: AbortSignal.timeout(2_500) },
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function processCommandLine(pid) {
  try {
    return (await readFile(`/proc/${pid}/cmdline`)).toString("utf8").split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

async function stopOwnedServer(context) {
  let ready;
  try {
    ready = await readJson(context.readyFile);
  } catch {
    return false;
  }

  if (
    !isRecord(ready) ||
    ready.installId !== context.installState.installationId ||
    !Number.isInteger(ready.pid) ||
    ready.pid <= 1
  ) {
    await rm(context.readyFile, { force: true });
    return false;
  }

  const commandLine = await processCommandLine(ready.pid);
  const expectedNode = await realpath(context.nodePath);
  const expectedServer = await realpath(context.serverScript);
  const ownsProcess =
    commandLine.length >= 2 &&
    (
      await Promise.all(
        commandLine.slice(0, 2).map(async (item) => {
          try {
            return await realpath(item);
          } catch {
            return item;
          }
        }),
      )
    ).every((item, index) => item === [expectedNode, expectedServer][index]);

  if (!ownsProcess) {
    // Um encerramento abrupto pode deixar o PID antigo no arquivo; o PID também
    // pode já ter sido reutilizado por outro programa. Em ambos os casos, remover
    // somente o estado obsoleto é seguro e evita tocar no processo alheio.
    await rm(context.readyFile, { force: true });
    return false;
  }

  try {
    process.kill(ready.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(ready.pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      await rm(context.readyFile, { force: true });
      return true;
    }
  }

  process.kill(ready.pid, "SIGKILL");
  await rm(context.readyFile, { force: true });
  return true;
}

async function buildContext() {
  const scriptPath = await realpath(fileURLToPath(import.meta.url));
  const versionRoot = path.resolve(path.dirname(scriptPath), "..");
  const installRoot = path.resolve(versionRoot, "../..");
  const installStatePath = path.join(installRoot, "install-state.json");
  const installState = await readJson(installStatePath);

  if (
    !isRecord(installState) ||
    installState.schemaVersion !== 1 ||
    installState.platform !== "linux-x64" ||
    installState.application?.id !== "br.com.megadoor.os" ||
    installState.activeVersion !== path.basename(versionRoot) ||
    typeof installState.installationId !== "string" ||
    !INSTALLATION_ID_PATTERN.test(installState.installationId)
  ) {
    throw new Error("O estado da instalação está ausente ou incompatível.");
  }

  const configRoot = xdgPath("XDG_CONFIG_HOME", ".config");
  const stateBase = xdgPath("XDG_STATE_HOME", ".local/state");
  const configPath = path.join(configRoot, "megadoor/runtime-config.json");
  const stateRoot = path.join(stateBase, "megadoor");
  const readyFile = path.join(stateRoot, "server-state.json");
  const logsRoot = path.join(stateRoot, "logs");
  const appRoot = path.join(versionRoot, "app");
  const nodePath = path.join(versionRoot, "runtime/bin/node");
  const serverScript = path.join(versionRoot, "server/static-server.mjs");

  await Promise.all([
    access(path.join(appRoot, "index.html"), fsConstants.R_OK),
    access(nodePath, fsConstants.X_OK),
    access(serverScript, fsConstants.R_OK),
  ]);
  if (
    !Number.isInteger(installState.localApplicationPort) ||
    installState.localApplicationPort < 1 ||
    installState.localApplicationPort > 65_535 ||
    !Number.isInteger(installState.configurationSchemaVersion) ||
    installState.configurationSchemaVersion < 1
  ) {
    throw new Error("As constantes da instalação estão ausentes ou inválidas.");
  }
  return {
    appRoot,
    configPath,
    installRoot,
    installState,
    logsRoot,
    nodePath,
    readyFile,
    serverScript,
    versionRoot,
  };
}

async function start() {
  const context = await buildContext();
  const argument = process.argv[2];
  if (argument === "--self-test") {
    validateRuntimeConfig(
      await readJson(context.configPath),
      context.installState.configurationSchemaVersion,
      context.installState.installationId,
    );
    process.stdout.write("Megadoor Linux: configuração válida.\n");
    return;
  }
  if (argument === "--stop-only") {
    await stopOwnedServer(context);
    return;
  }
  if (argument) throw new Error(`Argumento desconhecido: ${argument}`);

  const runtimeConfig = validateRuntimeConfig(
    await readJson(context.configPath),
    context.installState.configurationSchemaVersion,
    context.installState.installationId,
  );

  await mkdir(context.logsRoot, { recursive: true, mode: 0o700 });
  const origin = `http://127.0.0.1:${context.installState.localApplicationPort}`;
  let health = await fetchHealth(origin, context.installState.installationId);

  if (!health) {
    const logPath = path.join(context.logsRoot, "servidor-local.log");
    const logHandle = await open(logPath, "a", 0o600);
    const child = spawn(
      context.nodePath,
      [
        context.serverScript,
        "--app-root",
        context.appRoot,
        "--config",
        context.configPath,
        "--configuration-schema-version",
        String(context.installState.configurationSchemaVersion),
        "--install-id",
        context.installState.installationId,
        "--port",
        String(context.installState.localApplicationPort),
        "--ready-file",
        context.readyFile,
        "--version",
        context.installState.activeVersion,
      ],
      { detached: true, stdio: ["ignore", logHandle.fd, logHandle.fd] },
    );

    try {
      await waitForSpawn(child);
      child.unref();
      health = await waitForLocalServer(origin, context.installState.installationId, child);
    } finally {
      await logHandle.close();
    }
  }

  if (!health) throw new Error("Não foi possível confirmar o servidor local do Megadoor.");
  await openBrowser(origin);

  if (!(await checkFastApi(runtimeConfig))) {
    await notify(
      "Megadoor",
      "Servidor não encontrado. A aplicação foi aberta, mas alguns recursos podem estar indisponíveis.",
    );
  }
}

start().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Falha ao iniciar o Megadoor: ${message}\n`);
  await notify("Megadoor", `Não foi possível abrir o Megadoor.\n${message}`, true);
  process.exitCode = 1;
});
