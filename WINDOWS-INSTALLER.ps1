Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$NomeAplicacao = "Megadoor"
$VersaoNode = "24.19.0"
$ArquivoNode = "node-v$VersaoNode-win-x64.zip"
$UrlNode = "https://nodejs.org/dist/v$VersaoNode/$ArquivoNode"
$Sha256Node = "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73"
$RaizProjeto = $PSScriptRoot
$RaizRuntime = Join-Path $RaizProjeto ".runtime"
$NodeLocal = Join-Path $RaizRuntime "node"
$LogInstalacao = Join-Path $RaizRuntime "instalacao-windows.log"
$Temporario = Join-Path $env:TEMP ("megadoor-installer-" + [Guid]::NewGuid().ToString("N"))
$Icone = Join-Path $RaizProjeto "assets\icons\megadoor-icon.ico"
$script:ProcessoAnimado = $null
$script:TrabalhoAnimado = $null

function Informar([string]$Mensagem) {
    Write-Host "[Megadoor] $Mensagem" -ForegroundColor Cyan
}

function Falhar([string]$Mensagem) {
    throw "[Megadoor] $Mensagem"
}

function Mostrar-Barra([string]$Rotulo, [int]$Percentual) {
    $Percentual = [Math]::Max(0, [Math]::Min(100, $Percentual))
    $Largura = 30
    $Preenchido = [Math]::Floor($Percentual * $Largura / 100)
    $Barra = ("#" * $Preenchido) + ("-" * ($Largura - $Preenchido))
    Write-Host ("`r[{0}] {1,3}%  {2}" -f $Barra, $Percentual, $Rotulo) -NoNewline -ForegroundColor Yellow
}

function Concluir-Etapa([string]$Rotulo) {
    Mostrar-Barra $Rotulo 100
    Write-Host "  OK" -ForegroundColor Green
}

function Invoke-ProcessoAnimado {
    param(
        [Parameter(Mandatory = $true)][string]$Rotulo,
        [Parameter(Mandatory = $true)][string]$Executavel,
        [Parameter(Mandatory = $true)][string[]]$Argumentos
    )

    $Saida = Join-Path $Temporario ("saida-" + [Guid]::NewGuid().ToString("N") + ".log")
    $Erro = Join-Path $Temporario ("erro-" + [Guid]::NewGuid().ToString("N") + ".log")
    $Processo = Start-Process -FilePath $Executavel -ArgumentList $Argumentos `
        -WorkingDirectory $RaizProjeto -RedirectStandardOutput $Saida `
        -RedirectStandardError $Erro -PassThru
    $script:ProcessoAnimado = $Processo
    $Percentual = 7
    $Quadro = 0
    $Indicadores = @("|", "/", "-", "\")
    while (-not $Processo.HasExited) {
        Mostrar-Barra "$Rotulo $($Indicadores[$Quadro % $Indicadores.Count])" $Percentual
        $Quadro++
        $Percentual += 3
        if ($Percentual -gt 91) { $Percentual = 91 }
        Start-Sleep -Milliseconds 120
        $Processo.Refresh()
    }
    $Processo.WaitForExit()
    $script:ProcessoAnimado = $null

    if (Test-Path -LiteralPath $Saida) { Get-Content -LiteralPath $Saida | Add-Content -LiteralPath $LogInstalacao }
    if (Test-Path -LiteralPath $Erro) { Get-Content -LiteralPath $Erro | Add-Content -LiteralPath $LogInstalacao }
    if ($Processo.ExitCode -ne 0) {
        Write-Host ""
        if (Test-Path -LiteralPath $Erro) { Get-Content -LiteralPath $Erro -Tail 25 | Write-Host }
        if (Test-Path -LiteralPath $Saida) { Get-Content -LiteralPath $Saida -Tail 25 | Write-Host }
        Falhar "$Rotulo falhou (código $($Processo.ExitCode)). Consulte $LogInstalacao."
    }
    Concluir-Etapa $Rotulo
}

function Invoke-TrabalhoAnimado {
    param(
        [Parameter(Mandatory = $true)][string]$Rotulo,
        [Parameter(Mandatory = $true)][scriptblock]$Trabalho,
        [object[]]$Argumentos = @()
    )
    $Job = Start-Job -ScriptBlock $Trabalho -ArgumentList $Argumentos
    $script:TrabalhoAnimado = $Job
    $Percentual = 9
    $Quadro = 0
    $Indicadores = @("|", "/", "-", "\")
    while ($Job.State -in @("NotStarted", "Running")) {
        Mostrar-Barra "$Rotulo $($Indicadores[$Quadro % $Indicadores.Count])" $Percentual
        $Quadro++
        $Percentual += 4
        if ($Percentual -gt 91) { $Percentual = 91 }
        Start-Sleep -Milliseconds 120
        $Job = Get-Job -Id $Job.Id
    }
    try {
        $Resultado = Receive-Job -Job $Job -ErrorAction Stop
        if ($Job.State -ne "Completed") { Falhar "$Rotulo falhou." }
        Concluir-Etapa $Rotulo
        return $Resultado
    }
    finally {
        Remove-Job -Job $Job -Force -ErrorAction SilentlyContinue
        $script:TrabalhoAnimado = $null
    }
}

function Baixar-ComProgresso([string]$Url, [string]$Destino, [string]$Rotulo) {
    $Requisicao = [System.Net.HttpWebRequest]::Create($Url)
    $Requisicao.UserAgent = "Megadoor-Installer/1.0"
    $Resposta = $Requisicao.GetResponse()
    try {
        $Total = [long]$Resposta.ContentLength
        $Entrada = $Resposta.GetResponseStream()
        $Saida = [System.IO.File]::Create($Destino)
        try {
            $Buffer = New-Object byte[] (1024 * 1024)
            $Recebido = 0L
            while (($Lidos = $Entrada.Read($Buffer, 0, $Buffer.Length)) -gt 0) {
                $Saida.Write($Buffer, 0, $Lidos)
                $Recebido += $Lidos
                $Percentual = if ($Total -gt 0) { [int](($Recebido * 100) / $Total) } else { 50 }
                Mostrar-Barra $Rotulo $Percentual
            }
        }
        finally {
            $Saida.Dispose()
            $Entrada.Dispose()
        }
    }
    finally { $Resposta.Dispose() }
    Concluir-Etapa $Rotulo
}

function Get-ValorEnv([string]$Chave) {
    foreach ($Arquivo in @((Join-Path $RaizProjeto ".env.local"), (Join-Path $RaizProjeto ".env.production"))) {
        if (-not (Test-Path -LiteralPath $Arquivo -PathType Leaf)) { continue }
        foreach ($LinhaOriginal in Get-Content -LiteralPath $Arquivo -Encoding UTF8) {
            $Linha = $LinhaOriginal.Trim()
            if ($Linha.StartsWith("$Chave=")) {
                $Valor = $Linha.Substring($Linha.IndexOf("=") + 1).Trim()
                if (($Valor.StartsWith('"') -and $Valor.EndsWith('"')) -or
                    ($Valor.StartsWith("'") -and $Valor.EndsWith("'"))) {
                    $Valor = $Valor.Substring(1, $Valor.Length - 2)
                }
                return $Valor
            }
        }
    }
    return ""
}

function Verificar-Firebase {
    foreach ($Chave in @(
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_STORAGE_BUCKET",
        "VITE_FIREBASE_MESSAGING_SENDER_ID",
        "VITE_FIREBASE_APP_ID"
    )) {
        if (-not (Get-ValorEnv $Chave)) {
            Falhar "A configuração pública do Firebase está incompleta: falta $Chave."
        }
    }
    $ChaveApi = Get-ValorEnv "VITE_FIREBASE_API_KEY"
    $Projeto = Get-ValorEnv "VITE_FIREBASE_PROJECT_ID"
    $NumeroProjeto = Get-ValorEnv "VITE_FIREBASE_MESSAGING_SENDER_ID"
    if ($Projeto -ne "megadoor-os-system") { Falhar "O projeto Firebase configurado é inválido." }

    Mostrar-Barra "Verificando conexão com o Firebase" 25
    try {
        $Resposta = Invoke-RestMethod `
            -Uri "https://identitytoolkit.googleapis.com/v1/projects?key=$ChaveApi" `
            -Method Get -TimeoutSec 20 -UseBasicParsing
    }
    catch { Falhar "Não foi possível conectar ao Firebase. Verifique a internet e tente novamente." }
    if ([string]$Resposta.projectId -ne $NumeroProjeto) {
        Falhar "O Firebase respondeu, mas a configuração não corresponde ao projeto esperado."
    }
    Concluir-Etapa "Verificando conexão com o Firebase"
}

function Test-Java21 {
    $Java = Get-Command java.exe -ErrorAction SilentlyContinue
    if (-not $Java) { return $false }
    $Texto = (& $Java.Source -version 2>&1) -join " "
    if ($Texto -match 'version "(?<major>\d+)') { return [int]$Matches.major -ge 21 }
    return $false
}

function Preparar-JavaSeNecessario {
    if ((Get-ValorEnv "VITE_MODO_APLICACAO").ToUpperInvariant() -ne "EMULADORES") {
        Concluir-Etapa "Verificando dependências do modo configurado"
        return
    }
    if (Test-Java21) {
        Concluir-Etapa "Verificando Java 21"
        return
    }
    $Winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $Winget) {
        Falhar "O modo EMULADORES requer Java 21 e o Windows Package Manager não está disponível."
    }
    Invoke-ProcessoAnimado "Instalando Java 21 para os emuladores" $Winget.Source @(
        "install", "--id", "Microsoft.OpenJDK.21", "--exact", "--silent",
        "--accept-package-agreements", "--accept-source-agreements"
    )
}

function Preparar-Node {
    $Anterior = Join-Path $RaizRuntime "node.anterior"
    if (Test-Path -LiteralPath $Anterior -PathType Container) {
        if (Test-Path -LiteralPath $NodeLocal) {
            Remove-Item -LiteralPath $Anterior -Recurse -Force
        }
        else {
            Move-Item -LiteralPath $Anterior -Destination $NodeLocal
        }
    }
    $ExecutavelNode = Join-Path $NodeLocal "node.exe"
    if (Test-Path -LiteralPath $ExecutavelNode -PathType Leaf) {
        $Atual = (& $ExecutavelNode --version 2>$null)
        if ($Atual -eq "v$VersaoNode") {
            Concluir-Etapa "Verificando Node.js privado $VersaoNode"
            return
        }
    }

    $PacoteNode = Join-Path $Temporario $ArquivoNode
    Baixar-ComProgresso $UrlNode $PacoteNode "Baixando Node.js privado $VersaoNode"
    $Hash = (Get-FileHash -LiteralPath $PacoteNode -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Hash -ne $Sha256Node) { Falhar "O Node.js baixado não passou na verificação SHA-256." }
    Concluir-Etapa "Validando integridade do Node.js"

    $Extracao = Join-Path $Temporario "node"
    Invoke-TrabalhoAnimado "Extraindo Node.js" {
        param($Pacote, $Destino)
        Expand-Archive -LiteralPath $Pacote -DestinationPath $Destino -Force
    } @($PacoteNode, $Extracao) | Out-Null

    $Origem = Join-Path $Extracao "node-v$VersaoNode-win-x64"
    if (-not (Test-Path -LiteralPath (Join-Path $Origem "node.exe") -PathType Leaf)) {
        Falhar "O pacote Node.js extraído está incompleto."
    }
    $Novo = Join-Path $RaizRuntime "node.novo"
    if (Test-Path -LiteralPath $Novo) { Remove-Item -LiteralPath $Novo -Recurse -Force }
    if (Test-Path -LiteralPath $Anterior) { Remove-Item -LiteralPath $Anterior -Recurse -Force }
    Move-Item -LiteralPath $Origem -Destination $Novo
    if (Test-Path -LiteralPath $NodeLocal) { Move-Item -LiteralPath $NodeLocal -Destination $Anterior }
    try { Move-Item -LiteralPath $Novo -Destination $NodeLocal }
    catch {
        if (Test-Path -LiteralPath $Anterior) { Move-Item -LiteralPath $Anterior -Destination $NodeLocal }
        throw
    }
    if (Test-Path -LiteralPath $Anterior) { Remove-Item -LiteralPath $Anterior -Recurse -Force }
    Concluir-Etapa "Instalando Node.js privado"
}

function Criar-Atalho {
    $Shell = New-Object -ComObject WScript.Shell
    $Desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
    if ([string]::IsNullOrWhiteSpace($Desktop) -or -not [System.IO.Path]::IsPathRooted($Desktop)) {
        Falhar "O Windows não informou o caminho real da Área de Trabalho."
    }
    if (-not (Test-Path -LiteralPath $Desktop -PathType Container)) {
        New-Item -ItemType Directory -Path $Desktop -Force | Out-Null
    }

    $Atalho = $Shell.CreateShortcut((Join-Path $Desktop "$NomeAplicacao.lnk"))
    $Atalho.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $Atalho.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $RaizProjeto "START.ps1") + '" REAL'
    $Atalho.WorkingDirectory = $RaizProjeto
    $Atalho.IconLocation = "$Icone,0"
    $Atalho.Description = "Abrir o Megadoor OS"
    $Atalho.Save()
    $CaminhoAtalho = Join-Path $Desktop "$NomeAplicacao.lnk"
    if (-not (Test-Path -LiteralPath $CaminhoAtalho -PathType Leaf)) {
        Falhar "O Windows não confirmou a criação do atalho em $CaminhoAtalho."
    }
    Concluir-Etapa "Criando atalho na Área de Trabalho"
}

try {
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        Falhar "Este instalador requer Windows PowerShell 5.1 ou superior."
    }
    if ($PSVersionTable.PSEdition -eq "Core" -and -not $IsWindows) {
        Falhar "Execute WINDOWS-INSTALLER.ps1 no Windows."
    }
    if (-not [Environment]::Is64BitOperatingSystem) { Falhar "Este instalador requer Windows de 64 bits." }
    if ($RaizProjeto.Contains("%")) {
        Falhar "Mova a pasta extraída para um caminho sem o caractere % e execute o instalador novamente."
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    foreach ($Arquivo in @(
        "package.json", "package-lock.json", "START.ps1", ".env.production", "assets\icons\megadoor-icon.ico"
    )) {
        if (-not (Test-Path -LiteralPath (Join-Path $RaizProjeto $Arquivo) -PathType Leaf)) {
            Falhar "Arquivo ausente: $Arquivo. Extraia integralmente o ZIP baixado do GitHub."
        }
    }

    New-Item -ItemType Directory -Path $RaizRuntime -Force | Out-Null
    New-Item -ItemType Directory -Path $Temporario -Force | Out-Null
    [System.IO.File]::WriteAllText($LogInstalacao, "", (New-Object System.Text.UTF8Encoding($false)))

    Write-Host "`nInstalador do Megadoor para Windows" -ForegroundColor Cyan
    Write-Host "Projeto: $RaizProjeto`n"

    Preparar-Node
    if (-not (Test-Path -LiteralPath (Join-Path $RaizProjeto ".env.local") -PathType Leaf)) {
        Copy-Item -LiteralPath (Join-Path $RaizProjeto ".env.production") `
            -Destination (Join-Path $RaizProjeto ".env.local")
    }
    Concluir-Etapa "Preparando configuração local"

    $Node = Join-Path $NodeLocal "node.exe"
    $NpmCli = Join-Path $NodeLocal "node_modules\npm\bin\npm-cli.js"
    Invoke-ProcessoAnimado "Instalando dependências npm" $Node @(
        '"' + $NpmCli + '"', "ci", "--prefix", '"' + $RaizProjeto + '"', "--no-audit", "--no-fund"
    )

    Verificar-Firebase
    Preparar-JavaSeNecessario
    Criar-Atalho

    Write-Host "`nInstalação concluída." -ForegroundColor Green
    Write-Host "Use o atalho Megadoor na Área de Trabalho. Ele executará START.ps1 e abrirá o navegador."
    Write-Host "Não mova nem exclua esta pasta; o atalho aponta para: $RaizProjeto"
    Write-Host "A FastAPI não foi testada; ela pode ser configurada e conectada posteriormente."
}
catch {
    Write-Host "`nA instalação falhou: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    if ($script:ProcessoAnimado -and -not $script:ProcessoAnimado.HasExited) {
        & "$env:SystemRoot\System32\taskkill.exe" /PID $script:ProcessoAnimado.Id /T /F *> $null
        try { $script:ProcessoAnimado.WaitForExit(5000) | Out-Null } catch { }
    }
    if ($script:TrabalhoAnimado) {
        Stop-Job -Job $script:TrabalhoAnimado -ErrorAction SilentlyContinue
        Remove-Job -Job $script:TrabalhoAnimado -Force -ErrorAction SilentlyContinue
    }
    $RuntimeAnterior = Join-Path $RaizRuntime "node.anterior"
    if (Test-Path -LiteralPath $RuntimeAnterior -PathType Container) {
        if (Test-Path -LiteralPath $NodeLocal) {
            Remove-Item -LiteralPath $RuntimeAnterior -Recurse -Force -ErrorAction SilentlyContinue
        }
        else {
            Move-Item -LiteralPath $RuntimeAnterior -Destination $NodeLocal -ErrorAction SilentlyContinue
        }
    }
    $RuntimeNovo = Join-Path $RaizRuntime "node.novo"
    if (Test-Path -LiteralPath $RuntimeNovo) {
        Remove-Item -LiteralPath $RuntimeNovo -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $Temporario) {
        Remove-Item -LiteralPath $Temporario -Recurse -Force -ErrorAction SilentlyContinue
    }
}
