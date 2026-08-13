[CmdletBinding()]
param(
    [string]$ServerAddress,
    [ValidateRange(1, 65535)]
    [int]$ServerPort = 8443,
    [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ApplicationName = "Megadoor"
$NodeVersion = "24.19.0"
$NodeArchiveName = "node-v$NodeVersion-win-x64.zip"
$NodeDownloadUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeArchiveName"
$NodeArchiveSha256 = "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73"
$LocalApplicationPort = 41731
$SourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallRoot = Join-Path $env:LOCALAPPDATA "Programs\Megadoor"
$LogRoot = Join-Path $env:LOCALAPPDATA "Megadoor\Logs"
$StagingRoot = Join-Path $env:TEMP ("Megadoor-Install-" + [Guid]::NewGuid().ToString("N"))
$PayloadRoot = Join-Path $StagingRoot "payload"
$BackupRoot = "$InstallRoot.backup-" + [Guid]::NewGuid().ToString("N")
$TranscriptStarted = $false

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-IPv4 {
    param([string]$Value)
    $Address = $null
    return [System.Net.IPAddress]::TryParse($Value, [ref]$Address) -and
        $Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
        $Value -match '^\d{1,3}(\.\d{1,3}){3}$'
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )
    & $Executable @Arguments
    $ExitCode = if (Test-Path Variable:LASTEXITCODE) { [int]$LASTEXITCODE } else { 1 }
    if ($ExitCode -ne 0) {
        throw "$FailureMessage Código de saída: $ExitCode."
    }
}

function Stop-PreviousMegadoorServer {
    $StatePath = Join-Path $InstallRoot "server-state.json"
    $ExpectedNode = Join-Path $InstallRoot "runtime\node.exe"
    if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) { return }

    try {
        $State = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $Process = Get-Process -Id ([int]$State.pid) -ErrorAction Stop
        if ($Process.Path -and
            [System.StringComparer]::OrdinalIgnoreCase.Equals(
                [System.IO.Path]::GetFullPath($Process.Path),
                [System.IO.Path]::GetFullPath($ExpectedNode)
            )) {
            Write-Step "Encerrando a instância anterior do Megadoor"
            Stop-Process -Id $Process.Id -Force -ErrorAction Stop
            $Process.WaitForExit(10000)
        }
    }
    catch {
        Write-Warning "Não foi necessário ou não foi possível encerrar uma instância anterior: $($_.Exception.Message)"
    }
}

function New-RuntimeConfiguration {
    param([string]$Destination)
    $Configuration = [ordered]@{
        schemaVersion = 1
        installationId = [Guid]::NewGuid().ToString("N")
        server = [ordered]@{
            address = $ServerAddress
            port = $ServerPort
        }
    } | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText(
        $Destination,
        $Configuration + [Environment]::NewLine,
        (New-Object System.Text.UTF8Encoding($false))
    )
}

function New-WindowsLauncher {
    param([string]$Destination)
    $Launcher = @'
$ErrorActionPreference = "Stop"
$InstallRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = Join-Path $InstallRoot "runtime\node.exe"
$Server = Join-Path $InstallRoot "servidor-aplicacao-instalada.mjs"
$LogDirectory = Join-Path $env:LOCALAPPDATA "Megadoor\Logs"
$Url = "http://127.0.0.1:41731/"
$HealthUrl = "http://127.0.0.1:41731/.megadoor/health"

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null

function Test-Health {
    try {
        $Response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
        return $Response.StatusCode -eq 200
    }
    catch { return $false }
}

if (-not (Test-Path -LiteralPath $Node -PathType Leaf)) {
    [System.Windows.Forms.MessageBox]::Show(
        "A instalação do Megadoor está incompleta. Execute WindowsInstaller.ps1 novamente.",
        "Megadoor"
    ) | Out-Null
    exit 1
}

if (-not (Test-Health)) {
    $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $LogPath = Join-Path $LogDirectory "aplicacao-$Timestamp.log"
    Start-Process -FilePath $Node `
        -ArgumentList @($Server, $InstallRoot) `
        -WorkingDirectory $InstallRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $LogPath `
        -RedirectStandardError (Join-Path $LogDirectory "aplicacao-$Timestamp.err.log")

    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 40; $Attempt++) {
        Start-Sleep -Milliseconds 250
        if (Test-Health) { $Ready = $true; break }
    }
    if (-not $Ready) {
        [System.Windows.Forms.MessageBox]::Show(
            "O Megadoor foi instalado, mas o servidor local não iniciou. Consulte $LogDirectory.",
            "Megadoor"
        ) | Out-Null
        exit 2
    }
}

Start-Process $Url
'@
    $Launcher = "Add-Type -AssemblyName System.Windows.Forms`r`n" + $Launcher
    [System.IO.File]::WriteAllText(
        $Destination,
        $Launcher,
        (New-Object System.Text.UTF8Encoding($false))
    )
}

function New-DesktopShortcut {
    $Shell = New-Object -ComObject WScript.Shell
    $Desktop = $Shell.SpecialFolders.Item("Desktop")
    if ([string]::IsNullOrWhiteSpace($Desktop)) {
        throw "O Windows não informou o caminho real da Área de Trabalho."
    }

    $ShortcutPath = Join-Path $Desktop "$ApplicationName.lnk"
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
        (Join-Path $InstallRoot "Start-Megadoor.ps1") + '"'
    $Shortcut.WorkingDirectory = $InstallRoot
    $Shortcut.IconLocation = (Join-Path $InstallRoot "assets\megadoor-icon.ico") + ",0"
    $Shortcut.Description = "Abrir o Megadoor"
    $Shortcut.Save()
    return $ShortcutPath
}

try {
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw "O Megadoor requer Windows de 64 bits."
    }

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $RequiredSourceFiles = @(
        "package.json",
        "package-lock.json",
        ".env.production",
        "scripts\servidor-aplicacao-instalada.mjs",
        "assets\icons\megadoor-icon.ico"
    )
    foreach ($RelativePath in $RequiredSourceFiles) {
        $FullPath = Join-Path $SourceRoot $RelativePath
        if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
            throw "Arquivo obrigatório ausente: $RelativePath. Extraia o ZIP completo do projeto antes de instalar."
        }
    }

    if ([string]::IsNullOrWhiteSpace($ServerAddress)) {
        if ($NonInteractive) {
            throw "Use -ServerAddress no modo não interativo."
        }
        do {
            $ServerAddress = (Read-Host "IPv4 da máquina que executa a FastAPI").Trim()
            if (-not (Test-IPv4 $ServerAddress)) {
                Write-Host "Informe um IPv4 válido, por exemplo 192.168.1.20." -ForegroundColor Yellow
            }
        } while (-not (Test-IPv4 $ServerAddress))
    }
    elseif (-not (Test-IPv4 $ServerAddress)) {
        throw "ServerAddress deve ser um IPv4 válido."
    }

    New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
    $LogPath = Join-Path $LogRoot ("instalacao-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
    Start-Transcript -Path $LogPath -Force | Out-Null
    $TranscriptStarted = $true

    Write-Step "Preparando diretório temporário"
    New-Item -ItemType Directory -Path $PayloadRoot -Force | Out-Null

    Write-Step "Baixando o Node.js privado $NodeVersion"
    $NodeArchive = Join-Path $StagingRoot $NodeArchiveName
    Invoke-WebRequest -Uri $NodeDownloadUrl -OutFile $NodeArchive -UseBasicParsing
    $ActualHash = (Get-FileHash -LiteralPath $NodeArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ActualHash -ne $NodeArchiveSha256) {
        throw "O download do Node.js falhou na verificação SHA-256."
    }

    $ExtractedNode = Join-Path $StagingRoot "node-extraido"
    Expand-Archive -LiteralPath $NodeArchive -DestinationPath $ExtractedNode -Force
    $NodeRoot = Join-Path $ExtractedNode "node-v$NodeVersion-win-x64"
    if (-not (Test-Path -LiteralPath (Join-Path $NodeRoot "npm.cmd") -PathType Leaf)) {
        throw "O runtime Node.js baixado está incompleto."
    }

    Write-Step "Instalando dependências exatas do frontend"
    $Npm = Join-Path $NodeRoot "npm.cmd"
    Push-Location $SourceRoot
    try {
        Invoke-CheckedCommand $Npm @("ci", "--no-audit", "--no-fund") "Falha ao instalar as dependências do projeto."
        $env:VITE_MODO_APLICACAO = "REAL"
        $env:VITE_USAR_EMULADORES = "false"
        $env:VITE_USAR_CONFIGURACAO_RUNTIME = "true"
        Invoke-CheckedCommand $Npm @("run", "build") "Falha ao compilar a aplicação."
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot "dist\index.html") -PathType Leaf)) {
        throw "A compilação terminou sem produzir dist\index.html."
    }

    Write-Step "Montando a instalação definitiva"
    Copy-Item -LiteralPath $NodeRoot -Destination (Join-Path $PayloadRoot "runtime") -Recurse
    New-Item -ItemType Directory -Path (Join-Path $PayloadRoot "app") -Force | Out-Null
    Copy-Item -Path (Join-Path $SourceRoot "dist\*") -Destination (Join-Path $PayloadRoot "app") -Recurse -Force
    New-Item -ItemType Directory -Path (Join-Path $PayloadRoot "assets") -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $SourceRoot "assets\icons\megadoor-icon.ico") `
        -Destination (Join-Path $PayloadRoot "assets\megadoor-icon.ico")
    Copy-Item -LiteralPath (Join-Path $SourceRoot "scripts\servidor-aplicacao-instalada.mjs") `
        -Destination (Join-Path $PayloadRoot "servidor-aplicacao-instalada.mjs")
    New-RuntimeConfiguration (Join-Path $PayloadRoot "app\runtime-config.json")
    New-WindowsLauncher (Join-Path $PayloadRoot "Start-Megadoor.ps1")

    Stop-PreviousMegadoorServer
    $InstallParent = Split-Path -Parent $InstallRoot
    New-Item -ItemType Directory -Path $InstallParent -Force | Out-Null
    if (Test-Path -LiteralPath $InstallRoot) {
        Move-Item -LiteralPath $InstallRoot -Destination $BackupRoot
    }
    Move-Item -LiteralPath $PayloadRoot -Destination $InstallRoot

    $ShortcutPath = New-DesktopShortcut
    if (Test-Path -LiteralPath $BackupRoot) {
        Remove-Item -LiteralPath $BackupRoot -Recurse -Force
    }

    Write-Host "`nMegadoor instalado com sucesso." -ForegroundColor Green
    Write-Host "Instalação: $InstallRoot"
    Write-Host "Atalho: $ShortcutPath"
    Write-Host "Log: $LogPath"

    if (-not $NonInteractive) {
        $OpenNow = Read-Host "Deseja abrir o Megadoor agora? [S/n]"
        if ([string]::IsNullOrWhiteSpace($OpenNow) -or $OpenNow -match '^[sS]') {
            & (Join-Path $InstallRoot "Start-Megadoor.ps1")
        }
    }
}
catch {
    Write-Host "`nA instalação falhou: $($_.Exception.Message)" -ForegroundColor Red
    if ((Test-Path -LiteralPath $BackupRoot) -and -not (Test-Path -LiteralPath $InstallRoot)) {
        Move-Item -LiteralPath $BackupRoot -Destination $InstallRoot
        Write-Host "A instalação anterior foi restaurada." -ForegroundColor Yellow
    }
    exit 1
}
finally {
    if ($TranscriptStarted) { Stop-Transcript | Out-Null }
    if (Test-Path -LiteralPath $StagingRoot) {
        Remove-Item -LiteralPath $StagingRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
