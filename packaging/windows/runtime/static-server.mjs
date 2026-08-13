import { createReadStream } from "node:fs";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { isIPv4 } from "node:net";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const HEALTH_PATH = "/__megadoor/health";
const RUNTIME_CONFIG_PATH = "/runtime-config.json";
const LOOPBACK_HOST = "127.0.0.1";
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

const MIME_TYPES = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function responderJson(response, statusCode, value, method = "GET") {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": body.length,
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });

  response.end(method === "HEAD" ? undefined : body);
}

function hasOnlyKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const normalizedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === normalizedExpectedKeys.length &&
    actualKeys.every((key, index) => key === normalizedExpectedKeys[index])
  );
}

function validarConfiguracaoDeRuntime(value, expectedSchemaVersion, expectedInstallationId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A configuração de runtime deve ser um objeto JSON.");
  }

  if (!hasOnlyKeys(value, ["schemaVersion", "installationId", "server"])) {
    throw new Error("A configuração de runtime contém campos desconhecidos.");
  }

  if (value.schemaVersion !== expectedSchemaVersion) {
    throw new Error("Versão incompatível da configuração de runtime.");
  }

  if (
    typeof value.installationId !== "string" ||
    !INSTALLATION_ID_PATTERN.test(value.installationId) ||
    value.installationId !== expectedInstallationId
  ) {
    throw new Error("A configuração contém um identificador de instalação inválido.");
  }

  const server = value.server;
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    throw new Error("A configuração não contém o servidor.");
  }

  if (!hasOnlyKeys(server, ["address", "port"])) {
    throw new Error("A configuração do servidor contém campos desconhecidos.");
  }

  if (typeof server.address !== "string" || !isIPv4(server.address)) {
    throw new Error("A configuração contém um endereço IPv4 inválido.");
  }

  if (!Number.isInteger(server.port) || server.port < 1 || server.port > 65_535) {
    throw new Error("A configuração contém uma porta inválida.");
  }

  return {
    schemaVersion: value.schemaVersion,
    installationId: value.installationId,
    server: {
      address: server.address,
      port: server.port,
    },
  };
}

async function lerConfiguracaoDeRuntime(configPath, expectedSchemaVersion, expectedInstallationId) {
  const contents = await readFile(configPath, "utf8");
  return validarConfiguracaoDeRuntime(
    JSON.parse(contents),
    expectedSchemaVersion,
    expectedInstallationId,
  );
}

function isHashedAsset(fileName) {
  return /(?:^|[-_.])[A-Za-z0-9_-]{8,}(?=\.)/.test(fileName);
}

function cacheControlFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") {
    return "no-store";
  }

  if (isHashedAsset(path.basename(filePath))) {
    return "public, max-age=31536000, immutable";
  }

  return "no-cache";
}

function pathIsInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

async function resolveStaticFile(appRoot, appRootReal, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return { errorStatus: 400 };
  }

  if (decodedPath.includes("\0") || decodedPath.includes("\\")) {
    return { errorStatus: 400 };
  }

  if (decodedPath === "/") {
    decodedPath = "/index.html";
  }

  const segments = decodedPath.split("/");
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    return { errorStatus: 403 };
  }

  const candidate = path.resolve(appRoot, `.${decodedPath}`);
  if (!pathIsInside(candidate, appRoot)) {
    return { errorStatus: 403 };
  }

  let candidateStats;
  let candidateReal;
  try {
    candidateStats = await stat(candidate);
    candidateReal = await realpath(candidate);
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return { errorStatus: 404 };
    }
    throw error;
  }

  if (!candidateStats.isFile() || !pathIsInside(candidateReal, appRootReal)) {
    return { errorStatus: 404 };
  }

  return { candidateReal, candidateStats };
}

async function writeReadyFile(readyFile, value) {
  if (!readyFile) return;

  const parentDirectory = path.dirname(readyFile);
  const temporaryFile = `${readyFile}.${process.pid}.tmp`;
  await mkdir(parentDirectory, { recursive: true });
  await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rm(readyFile, { force: true });
  await rename(temporaryFile, readyFile);
}

async function removeOwnReadyFile(readyFile) {
  if (!readyFile) return;

  try {
    const current = JSON.parse(await readFile(readyFile, "utf8"));
    if (current.pid === process.pid) {
      await rm(readyFile, { force: true });
    }
  } catch {
    // A ausência ou alteração do arquivo não impede o encerramento do servidor.
  }
}

export async function criarServidorEstaticoMegadoor(options) {
  const { appRoot, configPath, configurationSchemaVersion, installId, port, readyFile, version } =
    options;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("A porta local deve ser um inteiro entre 1 e 65535.");
  }

  if (!Number.isInteger(configurationSchemaVersion) || configurationSchemaVersion < 1) {
    throw new Error("A versão do schema de configuração é inválida.");
  }

  if (!appRoot || !configPath || !installId || !version) {
    throw new Error("appRoot, configPath, installId e version são obrigatórios.");
  }

  if (typeof installId !== "string" || !INSTALLATION_ID_PATTERN.test(installId)) {
    throw new Error("installId deve conter de 8 a 128 caracteres seguros.");
  }

  const normalizedAppRoot = path.resolve(appRoot);
  const appRootReal = await realpath(normalizedAppRoot);
  const indexStats = await stat(path.join(appRootReal, "index.html"));
  if (!indexStats.isFile()) {
    throw new Error("O diretório da aplicação não contém index.html.");
  }

  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";

    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, {
        Allow: "GET, HEAD",
        "Cache-Control": "no-store",
        "Content-Length": 0,
        "X-Content-Type-Options": "nosniff",
      });
      response.end();
      return;
    }

    if (!request.url || request.url.length > 4_096) {
      responderJson(response, 400, { error: "REQUISICAO_INVALIDA" }, method);
      return;
    }

    let requestUrl;
    try {
      requestUrl = new URL(request.url, `http://${LOOPBACK_HOST}:${port}`);
    } catch {
      responderJson(response, 400, { error: "REQUISICAO_INVALIDA" }, method);
      return;
    }

    if (requestUrl.pathname === HEALTH_PATH) {
      responderJson(
        response,
        200,
        {
          status: "ok",
          installId,
          version,
          pid: process.pid,
        },
        method,
      );
      return;
    }

    if (requestUrl.pathname === RUNTIME_CONFIG_PATH) {
      try {
        const config = await lerConfiguracaoDeRuntime(
          configPath,
          configurationSchemaVersion,
          installId,
        );
        responderJson(response, 200, config, method);
      } catch {
        responderJson(response, 503, { error: "CONFIGURACAO_INDISPONIVEL" }, method);
      }
      return;
    }

    try {
      const resolved = await resolveStaticFile(normalizedAppRoot, appRootReal, requestUrl.pathname);
      if (resolved.errorStatus) {
        responderJson(response, resolved.errorStatus, { error: "ARQUIVO_NAO_ENCONTRADO" }, method);
        return;
      }

      const { candidateReal, candidateStats } = resolved;
      const headers = {
        "Cache-Control": cacheControlFor(candidateReal),
        "Content-Length": candidateStats.size,
        "Content-Type":
          MIME_TYPES.get(path.extname(candidateReal).toLowerCase()) ?? "application/octet-stream",
        "Last-Modified": candidateStats.mtime.toUTCString(),
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      };

      response.writeHead(200, headers);
      if (method === "HEAD") {
        response.end();
        return;
      }

      const stream = createReadStream(candidateReal);
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    } catch {
      if (!response.headersSent) {
        responderJson(response, 500, { error: "ERRO_INTERNO" }, method);
      } else {
        response.destroy();
      }
    }
  });

  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: LOOPBACK_HOST, port, exclusive: true });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const readyState = {
    schemaVersion: 1,
    status: "ready",
    installId,
    version,
    host: LOOPBACK_HOST,
    port: actualPort,
    pid: process.pid,
  };

  await writeReadyFile(readyFile, readyState);

  return {
    origin: `http://${LOOPBACK_HOST}:${actualPort}`,
    readyState,
    server,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await removeOwnReadyFile(readyFile);
    },
  };
}

function parseArguments(args) {
  const values = new Map();

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!option.startsWith("--")) {
      throw new Error(`Argumento inesperado: ${option}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`O argumento ${option} exige um valor.`);
    }

    if (values.has(option)) {
      throw new Error(`O argumento ${option} foi informado mais de uma vez.`);
    }

    values.set(option, value);
    index += 1;
  }

  const allowed = new Set([
    "--app-root",
    "--config",
    "--configuration-schema-version",
    "--install-id",
    "--port",
    "--ready-file",
    "--version",
  ]);

  for (const option of values.keys()) {
    if (!allowed.has(option)) {
      throw new Error(`Argumento desconhecido: ${option}`);
    }
  }

  return {
    appRoot: values.get("--app-root"),
    configPath: values.get("--config"),
    configurationSchemaVersion: Number(values.get("--configuration-schema-version")),
    installId: values.get("--install-id"),
    port: Number(values.get("--port")),
    readyFile: values.get("--ready-file"),
    version: values.get("--version"),
  };
}

async function runFromCommandLine() {
  const options = parseArguments(process.argv.slice(2));
  const instance = await criarServidorEstaticoMegadoor(options);
  if (process.stdout) {
    process.stdout.write(`MEGADOOR_READY ${JSON.stringify(instance.readyState)}\n`);
  }

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    try {
      await instance.close();
      process.exitCode = 0;
    } catch (error) {
      if (process.stderr) {
        process.stderr.write(`Falha ao encerrar o servidor: ${error.message}\n`);
      }
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entryPoint === import.meta.url) {
  runFromCommandLine().catch((error) => {
    if (process.stderr) {
      process.stderr.write(`Falha ao iniciar o servidor local: ${error.message}\n`);
    }
    process.exitCode = 1;
  });
}
