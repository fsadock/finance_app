# Installs or updates Finanças on Windows. Run it through install.bat (double-click).
#
# Downloads a private copy of Node.js into .runtime\ (no admin rights, doesn't touch any Node you
# already have), installs dependencies with pnpm, prepares the database and builds the app.
# Running it again updates an existing install and keeps your data.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # the progress bar makes Invoke-WebRequest very slow

# Keep in sync with install.sh and the pnpm version in package.json's "packageManager".
$NodeVersion = '24.21.0'

Set-Location $PSScriptRoot
$Root = $PSScriptRoot
$Runtime = Join-Path $Root '.runtime'
$NodeDir = Join-Path $Runtime 'node'

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { throw $msg }
function Invoke-Checked {
  param([string]$File, [string[]]$Arguments)
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { Fail "o comando falhou: $File $($Arguments -join ' ')" }
}

# ── 1. System ────────────────────────────────────────────────────────────────
Step 'Verificando o sistema'
# A 32-bit PowerShell reports x86 here; the real architecture is in PROCESSOR_ARCHITEW6432.
$archName = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
switch ($archName) {
  'AMD64' { $Arch = 'x64' }
  'ARM64' { $Arch = 'arm64' }
  default { Fail "processador não suportado: $archName." }
}
Write-Host "Sistema: win-$Arch"

# Updating while this app runs fails halfway (files in use), so stop early. Only this folder's app
# counts: other programs using port 3000 don't matter.
$appModules = (Join-Path $Root 'node_modules') + '\'
$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine.IndexOf($appModules, [StringComparison]::OrdinalIgnoreCase) -ge 0
}
if ($running) { Fail 'o app desta pasta está aberto. Feche a janela dele e rode a instalação de novo.' }

# ── 2. Node.js ───────────────────────────────────────────────────────────────
$NodeExe = Join-Path $NodeDir 'node.exe'
if ((Test-Path $NodeExe) -and ((& $NodeExe --version) -eq "v$NodeVersion")) {
  Step "Node.js $NodeVersion já instalado"
} else {
  Step "Baixando Node.js $NodeVersion"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $name = "node-v$NodeVersion-win-$Arch"
  $base = "https://nodejs.org/dist/v$NodeVersion"
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("financas-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $zip = Join-Path $tmp "$name.zip"
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$name.zip" -OutFile $zip
    $sums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
    if ($sums -is [byte[]]) { $sums = [Text.Encoding]::ASCII.GetString($sums) }
    $line = ($sums -split "`n") | Where-Object { $_ -match "\s$([regex]::Escape("$name.zip"))$" } | Select-Object -First 1
    if (-not $line) { Fail 'não foi possível verificar o download do Node.js.' }
    $expected = ($line -split '\s+')[0]
    if ((Get-FileHash -Algorithm SHA256 $zip).Hash -ne $expected.ToUpper()) {
      Fail 'o download do Node.js está corrompido. Tente de novo.'
    }
    Expand-Archive -Path $zip -DestinationPath $tmp
    if (Test-Path $NodeDir) { Remove-Item -Recurse -Force $NodeDir }
    New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
    Move-Item (Join-Path $tmp $name) $NodeDir
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

$env:Path = "$NodeDir;$env:Path"
# pnpm comes from Corepack (bundled with Node), pinned by "packageManager" in package.json.
$env:COREPACK_HOME = Join-Path $Runtime 'corepack'
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:PRISMA_HIDE_UPDATE_MESSAGE = '1'
$env:npm_config_update_notifier = 'false' # pnpm is pinned; its "update available" box only invites breaking that
$Corepack = Join-Path $NodeDir 'corepack.cmd'
function Pnpm { Invoke-Checked $Corepack (@('pnpm') + $args) }

# ── 3. Dependencies ──────────────────────────────────────────────────────────
Step 'Instalando dependências (pode levar alguns minutos)'
Pnpm install --frozen-lockfile

# ── 4. Configuration and database ────────────────────────────────────────────
if (-not (Test-Path '.env')) {
  Step 'Criando o arquivo .env'
  Copy-Item '.env.example' '.env'
}

if (Test-Path 'prisma\dev.db') {
  Step 'Fazendo backup do banco de dados'
  New-Item -ItemType Directory -Force -Path 'prisma\backups' | Out-Null
  $backup = "prisma/backups/dev-$(Get-Date -Format 'yyyyMMdd-HHmmss').db"
  Invoke-Checked $NodeExe @('-e', "require('better-sqlite3')('prisma/dev.db', { readonly: true }).backup(process.argv[1]).then(() => {})", $backup)
  Write-Host "Backup: $backup"
}

Step 'Preparando o banco de dados'
Pnpm db:setup

# ── 5. Build ─────────────────────────────────────────────────────────────────
Step 'Compilando o app'
Pnpm build
Remove-Item -Recurse -Force '.next\cache' -ErrorAction SilentlyContinue # only speeds up future builds

Step 'Pronto!'
Write-Host 'Para abrir o app, dê dois cliques em start.bat.'
Write-Host 'Ele usa a porta 3000 (ou a próxima livre). Deixe a janela aberta enquanto usa o app.'
