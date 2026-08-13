Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RaizDoFront = $PSScriptRoot
$PortaFront = 5173
$PortasEmuladores = @(4000, 4400, 4500, 8080, 9099, 9150)
$UrlAplicacao = "http://127.0.0.1:$PortaFront"
$UrlEmuladores = "http://127.0.0.1:4000"
$AbrirNavegador = $true
$ModoDeVerificacao = $false
$ModoSolicitado = ""
$Processos = New-Object System.Collections.Generic.List[object]

function Informar([string]$Mensagem) {
    Write-Host "[Megadoor OS] $Mensagem" -ForegroundColor Cyan
}

function Falhar([string]$Mensagem) {
    throw "[Megadoor OS] $Mensagem"
}

function Mostrar-Ajuda {
    @"
Uso:
  .\START.ps1 [DEMO|EMULADORES|REAL] [opções]

Sem informar um modo, o script respeita a configuração de .env.local.

Opções:
  --sem-navegador  Inicia os serviços sem abrir o navegador.
  --verificar       Encerra tudo assim que os serviços ficarem disponíveis.
  -h, --help        Mostra esta ajuda.

Use Ctrl+C para encerrar o Vue e, quando aplicável, os emuladores iniciados
por este script. A FastAPI é externa e nunca é iniciada ou modificada aqui.
"@ | Write-Host
}

foreach ($Argumento in $args) {
    switch ($Argumento.ToUpperInvariant()) {
        { $_ -in @("DEMO", "EMULADORES", "REAL") } {
            if ($ModoSolicitado) { Falhar "Informe somente um modo de execução." }
            $ModoSolicitado = $_
        }
        "--SEM-NAVEGADOR" { $AbrirNavegador = $false }
        "--VERIFICAR" { $ModoDeVerificacao = $true; $AbrirNavegador = $false }
        "--TESTE" { $ModoDeVerificacao = $true; $AbrirNavegador = $false }
        "-H" { Mostrar-Ajuda; exit 0 }
        "--HELP" { Mostrar-Ajuda; exit 0 }
        default { Falhar "Argumento desconhecido: $Argumento. Use --help para consultar as opções." }
    }
}

if ($PSVersionTable.PSVersion.Major -lt 5) {
    Falhar "Este script requer Windows PowerShell 5.1 ou superior."
}
if ($PSVersionTable.PSEdition -eq "Core" -and -not $IsWindows) {
    Falhar "Execute START.ps1 em um sistema Windows."
}
if ($RaizDoFront.Contains("%")) {
    Falhar "Mova a pasta do Megadoor para um caminho sem o caractere %, que não é suportado pelo servidor local do Vite."
}

Set-Location -LiteralPath $RaizDoFront

$NodeLocal = Join-Path $RaizDoFront ".runtime\node\node.exe"
$NpmLocal = Join-Path $RaizDoFront ".runtime\node\node_modules\npm\bin\npm-cli.js"
$NpxLocal = Join-Path $RaizDoFront ".runtime\node\node_modules\npm\bin\npx-cli.js"

if (Test-Path -LiteralPath $NodeLocal -PathType Leaf) {
    $Node = $NodeLocal
    $NpmCli = $NpmLocal
    $NpxCli = $NpxLocal
}
else {
    $NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $NpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $NodeCommand -or -not $NpmCommand) {
        Falhar "Node.js não está disponível. Execute WINDOWS-INSTALLER.ps1 primeiro."
    }
    $Node = $NodeCommand.Source
    $NpmCli = $NpmCommand.Source
    $NpxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
    $NpxCli = if ($NpxCommand) { $NpxCommand.Source } else { "" }
}

function Invoke-NodeCapture([string[]]$Argumentos) {
    $Saida = & $Node @Argumentos 2>&1
    if ($LASTEXITCODE -ne 0) { Falhar ($Saida -join [Environment]::NewLine) }
    return ($Saida -join [Environment]::NewLine).Trim()
}

$VersaoNode = Invoke-NodeCapture @("--version")
$PartesNode = $VersaoNode.TrimStart("v").Split(".")
if ([int]$PartesNode[0] -lt 20 -or ([int]$PartesNode[0] -eq 20 -and [int]$PartesNode[1] -lt 19)) {
    Falhar "É necessário Node.js 20.19 ou superior. Versão atual: $VersaoNode."
}

function Invoke-Npm([string[]]$Argumentos) {
    if ($NpmCli.EndsWith(".js")) { & $Node $NpmCli @Argumentos }
    else { & $NpmCli @Argumentos }
    if ($LASTEXITCODE -ne 0) { Falhar "npm falhou com código $LASTEXITCODE." }
}

$VersaoNpm = if ($NpmCli.EndsWith(".js")) {
    Invoke-NodeCapture @($NpmCli, "--version")
}
else {
    $SaidaNpm = & $NpmCli --version 2>&1
    if ($LASTEXITCODE -ne 0) { Falhar "Não foi possível consultar a versão do npm." }
    ($SaidaNpm -join [Environment]::NewLine).Trim()
}
$MaiorNpm = 0
if (-not [int]::TryParse($VersaoNpm.Split(".")[0], [ref]$MaiorNpm) -or $MaiorNpm -lt 10) {
    Falhar "É necessário npm 10 ou superior. Versão atual: $VersaoNpm."
}

if (-not (Test-Path -LiteralPath (Join-Path $RaizDoFront "node_modules\vite\bin\vite.js"))) {
    Informar "Instalando as dependências locais com npm ci..."
    Invoke-Npm @("ci")
}

function Read-DotEnvFile([string]$Caminho, [hashtable]$Destino) {
    if (-not (Test-Path -LiteralPath $Caminho -PathType Leaf)) { return }
    foreach ($LinhaOriginal in Get-Content -LiteralPath $Caminho -Encoding UTF8) {
        $Linha = $LinhaOriginal.Trim()
        if (-not $Linha -or $Linha.StartsWith("#") -or -not $Linha.Contains("=")) { continue }
        $Indice = $Linha.IndexOf("=")
        $Chave = $Linha.Substring(0, $Indice).Trim()
        $Valor = $Linha.Substring($Indice + 1).Trim()
        if (($Valor.StartsWith('"') -and $Valor.EndsWith('"')) -or
            ($Valor.StartsWith("'") -and $Valor.EndsWith("'"))) {
            $Valor = $Valor.Substring(1, $Valor.Length - 2)
        }
        $Destino[$Chave] = $Valor
    }
}

$Configuracao = @{}
Read-DotEnvFile (Join-Path $RaizDoFront ".env") $Configuracao
Read-DotEnvFile (Join-Path $RaizDoFront ".env.local") $Configuracao
Read-DotEnvFile (Join-Path $RaizDoFront ".env.development") $Configuracao
Read-DotEnvFile (Join-Path $RaizDoFront ".env.development.local") $Configuracao

function Get-ValorConfiguracao([string]$Chave) {
    $ValorDoProcesso = [Environment]::GetEnvironmentVariable($Chave)
    if ($null -ne $ValorDoProcesso) { return $ValorDoProcesso.Trim() }
    if ($Configuracao.ContainsKey($Chave)) { return ([string]$Configuracao[$Chave]).Trim() }
    return ""
}

$ModoInformado = if ($ModoSolicitado) { $ModoSolicitado } else { (Get-ValorConfiguracao "VITE_MODO_APLICACAO").ToUpperInvariant() }
if ($ModoInformado -and $ModoInformado -notin @("DEMO", "EMULADORES", "REAL")) {
    Falhar "VITE_MODO_APLICACAO inválido: $ModoInformado."
}

$ChavesFirebase = @(
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID"
)
$Preenchidos = @($ChavesFirebase | Where-Object { Get-ValorConfiguracao $_ }).Count
$Legado = (Get-ValorConfiguracao "VITE_USAR_EMULADORES").ToLowerInvariant()
if ($ModoSolicitado) { $Legado = if ($ModoSolicitado -eq "EMULADORES") { "true" } else { "false" } }
if ($Legado -and $Legado -notin @("true", "false")) {
    Falhar "VITE_USAR_EMULADORES deve ser true ou false."
}
$ModoAplicacao = if ($ModoInformado) {
    $ModoInformado
}
elseif ($Preenchidos -eq 0) {
    "DEMO"
}
elseif ($Legado -eq "true") {
    "EMULADORES"
}
else {
    "REAL"
}

if ($ModoAplicacao -ne "DEMO" -and $Preenchidos -ne $ChavesFirebase.Count) {
    Falhar "A configuração Firebase está incompleta para o modo $ModoAplicacao."
}
if ($ModoAplicacao -eq "REAL" -and (Get-ValorConfiguracao "VITE_FIREBASE_PROJECT_ID") -ne "megadoor-os-system") {
    Falhar "O modo REAL aceita somente o projeto megadoor-os-system."
}
if ($ModoAplicacao -eq "REAL" -and $Legado -eq "true") {
    Falhar "REAL não pode ser combinado com VITE_USAR_EMULADORES=true."
}
if ($ModoAplicacao -eq "EMULADORES" -and $Legado -eq "false") {
    Falhar "EMULADORES não pode ser combinado com VITE_USAR_EMULADORES=false."
}
$ProjetoFirebaseParaModo = if ($ModoSolicitado -eq "EMULADORES") {
    "demo-megadoor"
}
else {
    Get-ValorConfiguracao "VITE_FIREBASE_PROJECT_ID"
}
if ($ModoAplicacao -eq "EMULADORES" -and $ProjetoFirebaseParaModo -ne "demo-megadoor") {
    Falhar "O modo EMULADORES deve usar VITE_FIREBASE_PROJECT_ID=demo-megadoor."
}

function Test-PortaAberta([int]$Porta) {
    $Cliente = New-Object System.Net.Sockets.TcpClient
    try {
        $Tarefa = $Cliente.ConnectAsync("127.0.0.1", $Porta)
        return $Tarefa.Wait(250) -and $Cliente.Connected
    }
    catch { return $false }
    finally { $Cliente.Dispose() }
}

function Test-Http([string]$Url) {
    try {
        $Resposta = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $Resposta.StatusCode -ge 200 -and $Resposta.StatusCode -lt 300
    }
    catch { return $false }
}

function Exigir-PortaLivre([int]$Porta) {
    if (Test-PortaAberta $Porta) {
        Falhar "A porta $Porta já está em uso. Encerre o serviço existente e tente novamente."
    }
}

function Iniciar-ProcessoMegadoor([string]$Nome, [string]$Executavel, [string[]]$Argumentos) {
    Informar "Iniciando $Nome..."
    $Processo = Start-Process -FilePath $Executavel -ArgumentList $Argumentos `
        -WorkingDirectory $RaizDoFront -NoNewWindow -PassThru
    $Processos.Add([pscustomobject]@{ Nome = $Nome; Processo = $Processo })
    return $Processo
}

function Verificar-Processos {
    foreach ($Item in $Processos) {
        if ($Item.Processo.HasExited) { Falhar "$($Item.Nome) foi encerrado inesperadamente." }
    }
}

function Esperar-Http([string]$Url, [string]$Nome, [int]$Segundos) {
    $Cronometro = [Diagnostics.Stopwatch]::StartNew()
    while (-not (Test-Http $Url)) {
        Verificar-Processos
        if ($Cronometro.Elapsed.TotalSeconds -ge $Segundos) { Falhar "$Nome não respondeu em $Url." }
        Start-Sleep -Milliseconds 250
    }
}

function Esperar-Porta([int]$Porta, [string]$Nome, [int]$Segundos) {
    $Cronometro = [Diagnostics.Stopwatch]::StartNew()
    while (-not (Test-PortaAberta $Porta)) {
        Verificar-Processos
        if ($Cronometro.Elapsed.TotalSeconds -ge $Segundos) { Falhar "$Nome não ficou disponível na porta $Porta." }
        Start-Sleep -Milliseconds 250
    }
}

function Encerrar-Processos {
    if ($Processos.Count -gt 0) { Informar "Encerrando os serviços iniciados por este script..." }
    foreach ($Item in $Processos) {
        if (-not $Item.Processo.HasExited) {
            & "$env:SystemRoot\System32\taskkill.exe" /PID $Item.Processo.Id /T /F *> $null
        }
        try { $Item.Processo.WaitForExit(5000) | Out-Null } catch { }
    }
}

Exigir-PortaLivre $PortaFront
if ($ModoAplicacao -eq "EMULADORES") {
    if (-not (Get-Command java.exe -ErrorAction SilentlyContinue)) {
        Falhar "Java não está disponível. Execute WINDOWS-INSTALLER.ps1 novamente no modo EMULADORES."
    }
    foreach ($Porta in $PortasEmuladores) { Exigir-PortaLivre $Porta }
}

try {
    Informar "Modo selecionado: $ModoAplicacao."

    if ($ModoAplicacao -eq "EMULADORES") {
        if (-not (Test-Path -LiteralPath $NpxCli)) { Falhar "npx não foi encontrado no runtime Node.js." }
        $ArgumentosFirebase = @(
            '"' + $NpxCli + '"', "--yes", "firebase-tools@15.26.0", "emulators:start",
            "--project", "demo-megadoor", "--only", "auth,firestore"
        )
        Iniciar-ProcessoMegadoor "os emuladores Firebase" $Node $ArgumentosFirebase | Out-Null
        Esperar-Porta 9099 "Firebase Authentication Emulator" 180
        Esperar-Porta 8080 "Cloud Firestore Emulator" 180
        Esperar-Http $UrlEmuladores "Firebase Emulator UI" 180
        Informar "Emuladores disponíveis em $UrlEmuladores."
    }

    $VariaveisAnteriores = @{
        VITE_MODO_APLICACAO = $env:VITE_MODO_APLICACAO
        VITE_USAR_EMULADORES = $env:VITE_USAR_EMULADORES
        VITE_FIREBASE_PROJECT_ID = $env:VITE_FIREBASE_PROJECT_ID
    }
    try {
        $env:VITE_MODO_APLICACAO = $ModoAplicacao
        $env:VITE_USAR_EMULADORES = if ($ModoAplicacao -eq "EMULADORES") { "true" } else { "false" }
        if ($ModoAplicacao -eq "EMULADORES") { $env:VITE_FIREBASE_PROJECT_ID = "demo-megadoor" }
        $Vite = Join-Path $RaizDoFront "node_modules\vite\bin\vite.js"
        Iniciar-ProcessoMegadoor "o frontend Vue" $Node @(
            '"' + $Vite + '"', "--host", "127.0.0.1", "--port", "$PortaFront", "--strictPort"
        ) | Out-Null
    }
    finally {
        $env:VITE_MODO_APLICACAO = $VariaveisAnteriores.VITE_MODO_APLICACAO
        $env:VITE_USAR_EMULADORES = $VariaveisAnteriores.VITE_USAR_EMULADORES
        $env:VITE_FIREBASE_PROJECT_ID = $VariaveisAnteriores.VITE_FIREBASE_PROJECT_ID
    }

    Esperar-Http $UrlAplicacao "Frontend Vue" 90
    Informar "Aplicação disponível em $UrlAplicacao."
    if ($AbrirNavegador) {
        Start-Process $UrlAplicacao
        if ($ModoAplicacao -eq "EMULADORES") { Start-Process $UrlEmuladores }
    }

    if ($ModoAplicacao -eq "REAL") {
        Informar "Firebase e FastAPI são serviços externos e não são iniciados por este script."
    }
    elseif ($ModoAplicacao -eq "DEMO") {
        Informar "O modo DEMO funciona sem Firebase e sem FastAPI."
    }

    if ($ModoDeVerificacao) {
        Informar "Verificação concluída; encerrando os serviços de teste."
        exit 0
    }

    Informar "Pressione Ctrl+C para encerrar."
    while ($true) {
        Verificar-Processos
        Start-Sleep -Milliseconds 300
    }
}
finally {
    Encerrar-Processos
}
