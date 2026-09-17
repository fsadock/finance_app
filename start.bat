@echo off
rem Double-click to start Financas (installed with install.bat) and open it in the browser.
chcp 65001 >nul
cd /d "%~dp0"

if not exist ".runtime\node\node.exe" goto notinstalled
if not exist ".next" goto notinstalled

set "PATH=%~dp0.runtime\node;%PATH%"
set "COREPACK_HOME=%~dp0.runtime\corepack"
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
set "NEXT_TELEMETRY_DISABLED=1"
if not defined PORT set "PORT=3000"

rem Open the browser once the server answers (in the background).
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:' + $env:PORT; for ($i=0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 $u | Out-Null; Start-Process $u; break } catch { if ($_.Exception.Response) { Start-Process $u; break }; Start-Sleep 1 } }"

echo Iniciando em http://127.0.0.1:%PORT% - deixe esta janela aberta; feche-a para encerrar o app.
call corepack pnpm start
pause
exit /b 0

:notinstalled
echo O app ainda nao foi instalado. De dois cliques em install.bat primeiro.
pause
exit /b 1
