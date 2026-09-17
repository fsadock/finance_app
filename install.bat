@echo off
rem Double-click to install or update Financas on Windows. The work is done by install.ps1.
chcp 65001 >nul
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo A instalacao falhou. Veja a mensagem acima.
  if not defined CI pause
  exit /b 1
)

if defined CI exit /b 0
echo.
choice /c SN /m "Abrir o app agora"
if errorlevel 2 exit /b 0
call "%~dp0start.bat"
