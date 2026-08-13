import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const executar = promisify(execFile);
const temporario = await mkdtemp(path.join(os.tmpdir(), "megadoor-licenses-"));
const destino = path.join(temporario, "THIRD-PARTY-NOTICES.txt");

try {
  await executar(process.execPath, ["packaging/scripts/gerar-avisos-de-terceiros.mjs", destino], {
    cwd: path.resolve("."),
  });
  const avisos = await readFile(destino, "utf8");
  for (const pacote of ["firebase@", "hash-wasm@4.12.0", "vue@", "vue-router@", "zod@"]) {
    assert.match(avisos, new RegExp(`- ${pacote.replaceAll(".", "\\.")}`));
  }
  assert.match(avisos, /Licença: Apache-2\.0/);
  assert.match(avisos, /Licença: MIT/);
  assert.match(avisos, /Apache License/);
  assert.match(avisos, /Permission is hereby granted/);
} finally {
  await rm(temporario, { recursive: true, force: true });
}

process.stdout.write("Avisos de terceiros validados.\n");
