import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { criarServidorEstaticoMegadoor } from "./static-server.mjs";

async function obterPortaLivre() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function criarCenario() {
  const root = await mkdtemp(path.join(os.tmpdir(), "megadoor-static-server-"));
  const appRoot = path.join(root, "app");
  const assetDirectory = path.join(appRoot, "assets");
  const configPath = path.join(root, "config", "runtime-config.json");
  const readyFile = path.join(root, "state", "server-state.json");

  await mkdir(assetDirectory, { recursive: true });
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    path.join(appRoot, "index.html"),
    "<!doctype html><title>Megadoor</title>",
    "utf8",
  );
  await writeFile(
    path.join(assetDirectory, "index-AbCdEf12.js"),
    "export const ok = true;",
    "utf8",
  );
  await writeFile(path.join(root, "secret.txt"), "não deve ser servido", "utf8");
  await writeFile(
    configPath,
    JSON.stringify({
      schemaVersion: 1,
      installationId: "install-test-1",
      server: { address: "192.168.18.206", port: 8443 },
    }),
    "utf8",
  );

  return { appRoot, configPath, readyFile, root };
}

test("serve o build, a saúde e a configuração estrita da instalação", async (context) => {
  const scenario = await criarCenario();
  const port = await obterPortaLivre();
  const instance = await criarServidorEstaticoMegadoor({
    appRoot: scenario.appRoot,
    configPath: scenario.configPath,
    configurationSchemaVersion: 1,
    installId: "install-test-1",
    port,
    readyFile: scenario.readyFile,
    version: "1.0.0",
  });

  context.after(async () => {
    await instance.close();
    await rm(scenario.root, { recursive: true, force: true });
  });

  const indexResponse = await fetch(`${instance.origin}/`);
  assert.equal(indexResponse.status, 200);
  assert.equal(indexResponse.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(indexResponse.headers.get("cache-control"), "no-store");
  assert.match(await indexResponse.text(), /Megadoor/);

  const healthResponse = await fetch(`${instance.origin}/__megadoor/health`);
  assert.deepEqual(await healthResponse.json(), {
    status: "ok",
    installId: "install-test-1",
    version: "1.0.0",
    pid: process.pid,
  });

  const configResponse = await fetch(`${instance.origin}/runtime-config.json`);
  assert.deepEqual(await configResponse.json(), {
    schemaVersion: 1,
    installationId: "install-test-1",
    server: { address: "192.168.18.206", port: 8443 },
  });

  const readyState = JSON.parse(await readFile(scenario.readyFile, "utf8"));
  assert.equal(readyState.installId, "install-test-1");
  assert.equal(readyState.port, port);
});

test("relê a configuração sem reiniciar e rejeita configuração inválida", async (context) => {
  const scenario = await criarCenario();
  const instance = await criarServidorEstaticoMegadoor({
    appRoot: scenario.appRoot,
    configPath: scenario.configPath,
    configurationSchemaVersion: 1,
    installId: "install-test-2",
    port: await obterPortaLivre(),
    readyFile: scenario.readyFile,
    version: "1.0.0",
  });

  context.after(async () => {
    await instance.close();
    await rm(scenario.root, { recursive: true, force: true });
  });

  await writeFile(
    scenario.configPath,
    JSON.stringify({
      schemaVersion: 1,
      installationId: "install-test-2",
      server: { address: "10.0.0.15", port: 9443 },
    }),
    "utf8",
  );
  const updatedResponse = await fetch(`${instance.origin}/runtime-config.json`);
  assert.deepEqual(await updatedResponse.json(), {
    schemaVersion: 1,
    installationId: "install-test-2",
    server: { address: "10.0.0.15", port: 9443 },
  });

  await writeFile(
    scenario.configPath,
    JSON.stringify({
      schemaVersion: 1,
      installationId: "outra-instalacao",
      server: { address: "10.0.0.15", port: 9443 },
    }),
    "utf8",
  );
  const invalidResponse = await fetch(`${instance.origin}/runtime-config.json`);
  assert.equal(invalidResponse.status, 503);
  assert.deepEqual(await invalidResponse.json(), { error: "CONFIGURACAO_INDISPONIVEL" });

  await writeFile(
    scenario.configPath,
    JSON.stringify({
      schemaVersion: 1,
      installationId: "install-test-2",
      server: { address: "10.0.0.15", port: 9443 },
      campoDesconhecido: true,
    }),
    "utf8",
  );
  const extraFieldResponse = await fetch(`${instance.origin}/runtime-config.json`);
  assert.equal(extraFieldResponse.status, 503);
});

test("aplica cache aos assets versionados e bloqueia métodos e caminhos impróprios", async (context) => {
  const scenario = await criarCenario();
  const instance = await criarServidorEstaticoMegadoor({
    appRoot: scenario.appRoot,
    configPath: scenario.configPath,
    configurationSchemaVersion: 1,
    installId: "install-test-3",
    port: await obterPortaLivre(),
    readyFile: scenario.readyFile,
    version: "1.0.0",
  });

  context.after(async () => {
    await instance.close();
    await rm(scenario.root, { recursive: true, force: true });
  });

  const assetResponse = await fetch(`${instance.origin}/assets/index-AbCdEf12.js`);
  assert.equal(assetResponse.status, 200);
  assert.equal(assetResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");

  const headResponse = await fetch(`${instance.origin}/`, { method: "HEAD" });
  assert.equal(headResponse.status, 200);
  assert.equal(await headResponse.text(), "");

  const postResponse = await fetch(`${instance.origin}/`, { method: "POST" });
  assert.equal(postResponse.status, 405);
  assert.equal(postResponse.headers.get("allow"), "GET, HEAD");

  const traversalResponse = await fetch(`${instance.origin}/%2e%2e%5csecret.txt`);
  assert.equal(traversalResponse.status, 400);

  const missingResponse = await fetch(`${instance.origin}/arquivo-ausente.txt`);
  assert.equal(missingResponse.status, 404);
});

test("não segue link simbólico para fora da raiz da aplicação", async (context) => {
  const scenario = await criarCenario();
  const linkPath = path.join(scenario.appRoot, "outside.txt");

  try {
    await symlink(path.join(scenario.root, "secret.txt"), linkPath, "file");
  } catch (error) {
    if (process.platform === "win32" && (error.code === "EPERM" || error.code === "EACCES")) {
      context.skip(
        "O Windows não permitiu criar o link simbólico sem privilégio de desenvolvedor.",
      );
      await rm(scenario.root, { recursive: true, force: true });
      return;
    }
    throw error;
  }

  const instance = await criarServidorEstaticoMegadoor({
    appRoot: scenario.appRoot,
    configPath: scenario.configPath,
    configurationSchemaVersion: 1,
    installId: "install-test-4",
    port: await obterPortaLivre(),
    readyFile: scenario.readyFile,
    version: "1.0.0",
  });

  context.after(async () => {
    await instance.close();
    await rm(scenario.root, { recursive: true, force: true });
  });

  const response = await fetch(`${instance.origin}/outside.txt`);
  assert.equal(response.status, 404);
});

test("recusa um identificador de instalação inseguro antes de abrir a porta", async () => {
  const scenario = await criarCenario();

  try {
    await assert.rejects(
      criarServidorEstaticoMegadoor({
        appRoot: scenario.appRoot,
        configPath: scenario.configPath,
        configurationSchemaVersion: 1,
        installId: "id inválido",
        port: await obterPortaLivre(),
        readyFile: scenario.readyFile,
        version: "1.0.0",
      }),
      /8 a 128 caracteres seguros/,
    );
  } finally {
    await rm(scenario.root, { recursive: true, force: true });
  }
});
