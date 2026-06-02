@echo off
title HR Analytics
rem Double-click to run HR Analytics over http://localhost (downloads, uploads
rem and saved data all work). Uses built-in Windows PowerShell -- nothing to
rem install. Close this window to stop the app.

set "PS=%~dp0scripts\serve.ps1"
if not exist "%PS%" set "PS=%~dp0serve.ps1"
if not exist "%PS%" (
  echo Could not find serve.ps1 next to this launcher.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"
if errorlevel 1 pause
