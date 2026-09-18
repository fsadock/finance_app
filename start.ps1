# Starts Finanças (installed with install.bat) and opens it in the browser. Run it through start.bat.
#
# Usage: start.bat [--port 3000]
# Without --port (or PORT), it uses 3000, or the next free port if another program is using it.
$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot
$Root = $PSScriptRoot
$Runtime = Join-Path $Root '.runtime'
$NodeDir = Join-Path $Runtime 'node'
$PortFile = Join-Path $Runtime 'port'

$requested = $env:PORT
for ($i = 0; $i -lt $args.Count; $i++) {
  $a = [string]$args[$i]
  if ($a -in @('--port', '-p', '-port', '/port')) { $requested = if ($i + 1 -lt $args.Count) { [string]$args[++$i] } else { '?' } }
  elseif ($a -like '--port=*') { $requested = $a.Substring(7) }
  else { Write-Host "Opção desconhecida: $a`nUso: start.bat [--port 3000]"; exit 2 }
}
if ($requested -and -not ($requested -match '^\d+$' -and [int]$requested -ge 1 -and [int]$requested -le 65535)) {
  Write-Host "Porta inválida: $requested"; exit 2
}

if (-not (Test-Path (Join-Path $NodeDir 'node.exe')) -or -not (Test-Path '.next')) {
  Write-Host 'O app ainda não foi instalado. Dê dois cliques em install.bat primeiro.'; exit 1
}

# Anything accepting connections on the port, HTTP or not.
function Test-PortBusy([int]$p) {
  $client = New-Object Net.Sockets.TcpClient
  try { return $client.ConnectAsync('127.0.0.1', $p).Wait(500) } catch { return $false } finally { $client.Dispose() }
}

# Already open (e.g. double-started): just show it.
$appModules = (Join-Path $Root 'node_modules') + '\'
$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine.IndexOf($appModules, [StringComparison]::OrdinalIgnoreCase) -ge 0
}
if ($running) {
  if (Test-Path $PortFile) {
    $url = "http://127.0.0.1:$((Get-Content $PortFile -Raw).Trim())"
    Write-Host "O app já está aberto em $url"
    Start-Process $url
  } else {
    Write-Host 'O app desta pasta já está aberto.'
  }
  exit 0
}

if ($requested) {
  $port = [int]$requested
  if (Test-PortBusy $port) {
    Write-Host "A porta $port já está em uso por outro programa. Escolha outra: start.bat --port 3001"; exit 1
  }
} else {
  $port = 3000..3099 | Where-Object { -not (Test-PortBusy $_) } | Select-Object -First 1
  if (-not $port) { Write-Host 'Nenhuma porta livre entre 3000 e 3099. Escolha uma: start.bat --port 8080'; exit 1 }
}

$env:PORT = "$port"
$env:Path = "$NodeDir;$env:Path"
$env:COREPACK_HOME = Join-Path $Runtime 'corepack'
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:npm_config_update_notifier = 'false'
$url = "http://127.0.0.1:$port"
Set-Content -Path $PortFile -Value $port -NoNewline

# Open the browser once the server answers (in a hidden background PowerShell).
$opener = @"
for (`$i = 0; `$i -lt 60; `$i++) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '$url' | Out-Null; Start-Process '$url'; break }
  catch { if (`$_.Exception.Response) { Start-Process '$url'; break }; Start-Sleep 1 }
}
"@
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($opener))
Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile', '-EncodedCommand', $encoded

Write-Host "Iniciando em $url - deixe esta janela aberta; feche-a para encerrar o app."
& (Join-Path $NodeDir 'corepack.cmd') pnpm start
exit $LASTEXITCODE
