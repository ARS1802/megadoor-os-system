import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const windowsDirectory = dirname(fileURLToPath(import.meta.url));
const installerPath = resolve(windowsDirectory, "Megadoor.iss");
const constantsPath = resolve(windowsDirectory, "generated", "Constants.iss");
const launcherSourcePath = resolve(windowsDirectory, "launcher", "MegadoorLauncher.cs");

process.env.MEGADOOR_ALLOW_DIRTY_RELEASE ??= "1";
execFileSync(process.execPath, [resolve(windowsDirectory, "generate-inno-constants.mjs")], {
  cwd: resolve(windowsDirectory, "../.."),
  env: process.env,
  stdio: "inherit",
});

await Promise.all([
  access(installerPath, constants.R_OK),
  access(constantsPath, constants.R_OK),
  access(resolve(windowsDirectory, "installer-messages.pt-BR.isl"), constants.R_OK),
  access(launcherSourcePath, constants.R_OK),
]);

const installer = await readFile(installerPath, "utf8");
const generated = await readFile(constantsPath, "utf8");
const launcherSource = await readFile(launcherSourcePath, "utf8");

const requiredInstallerFragments = [
  "PrivilegesRequired=lowest",
  "DefaultDirName={localappdata}\\Programs\\",
  "ArchitecturesAllowed=x64compatible",
  "SetupArchitecture=x64",
  "CloseApplicationsFilter=Megadoor.exe,node.exe",
  "SetupLogging=yes",
  "UninstallLogging=yes",
  "runtime-config.json",
  "payload-manifest.json",
  "files.sha256",
  "THIRD-PARTY-NOTICES.txt",
  "ValidateInstalledChecksums",
  "GetSHA256OfFile",
  "ValidatePayloadAfterCopy",
  "ValidateFirebase",
  "ProbeFastApi",
  "StopExistingApplication",
  "Exec(Launcher, '--shutdown'",
  "InitializeUninstall",
  "UninstallSilent",
  "REMOVEDATA",
];

const missing = requiredInstallerFragments.filter((fragment) => !installer.includes(fragment));
if (missing.length > 0) {
  throw new Error(`Contrato do instalador incompleto: ${missing.join(", ")}`);
}

if (!generated.includes('#define RequiredInnoSetupVersion "7.1.0"')) {
  throw new Error("O compilador Inno Setup 7.1.0 não está fixado nas constantes.");
}

if (installer.includes("PrivilegesRequired=admin")) {
  throw new Error("O instalador não pode solicitar elevação administrativa.");
}

if (installer.includes("AppMutex=")) {
  throw new Error("AppMutex impediria reparar/desinstalar o launcher invisível.");
}

if (installer.includes("restartreplace")) {
  throw new Error(
    "Arquivos agendados para reboot não podem ser validados imediatamente por SHA-256.",
  );
}

if (!installer.includes("MinVersion=10.0.19045")) {
  throw new Error("A versão mínima precisa permanecer alinhada ao Windows 10 22H2 e .NET 4.8.");
}

for (const fragment of ["--shutdown", "ShutdownEventName", "WaitForLauncherToStop"]) {
  if (!launcherSource.includes(fragment)) {
    throw new Error(`Contrato de encerramento cooperativo ausente no launcher: ${fragment}`);
  }
}

process.stdout.write("Validação estática do instalador Windows concluída.\n");
