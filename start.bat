@echo off
rem Double-click to start Financas (installed with install.bat). Optional: start.bat --port 3000
chcp 65001 >nul
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if not defined CI pause
