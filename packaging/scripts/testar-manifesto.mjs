import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const executar = promisify(execFile);
const raiz = await mkdtemp(path.join(os.tmpdir(), "megadoor-manifest-test-"));

try {
  await mkdir(path.join(raiz, "sub"));
  await writeFile(path.join(raiz, "arquivo.txt"), "Megadoor\n");
  await writeFile(path.join(raiz, "sub/dados.bin"), new Uint8Array([0, 1, 2, 255]));

  await executar(process.execPath, ["packaging/scripts/gerar-manifesto.mjs", raiz, "teste"], {
    cwd: path.resolve("."),
    env: { ...process.env, MEGADOOR_RELEASE_COMMIT: "commit-de-teste" },
  });

  const manifest = JSON.parse(await readFile(path.join(raiz, "payload-manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.source.commit, "commit-de-teste");
  assert.equal(manifest.platform, "teste");
  assert.equal(manifest.firebase.projectId, "megadoor-os-system");
  assert.deepEqual(
    manifest.files.map((arquivo) => arquivo.path),
    ["arquivo.txt", "sub/dados.bin"],
  );
  assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/);

  const checksums = await readFile(path.join(raiz, "files.sha256"), "utf8");
  assert.match(checksums, /^[a-f0-9]{64}  arquivo\.txt$/m);
  assert.match(checksums, /^[a-f0-9]{64}  sub\/dados\.bin$/m);
} finally {
  await rm(raiz, { recursive: true, force: true });
}

process.stdout.write("Manifesto de distribuição validado.\n");
