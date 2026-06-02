@echo off
title HR Analytics
cd /d "%~dp0"

rem ===========================================================================
rem  HR Analytics launcher
rem
rem  Runs the tool over http://localhost and opens your browser. Do NOT just
rem  double-click index.html -- Chrome treats that as an untrusted "file://"
rem  page and blocks downloads (garbled filenames) and the upload picker.
rem
rem  Nothing is installed and nothing leaves your machine -- this only starts a
rem  tiny web server on your own PC. Keep this window open while you work;
rem  close it (or press Ctrl+C) to stop.
rem ===========================================================================

rem Use Node if it's installed (most reliable); otherwise built-in PowerShell.
where node >nul 2>nul
if not errorlevel 1 if exist "%~dp0scripts\serve.mjs" goto :node

set "PS=%~dp0scripts\serve.ps1"
if not exist "%PS%" set "PS=%~dp0serve.ps1"
if exist "%PS%" goto :ps

echo.
echo  Could not find a server script next to this launcher.
echo  Expected scripts\serve.mjs (Node) or serve.ps1 (PowerShell), and a built
echo  dist\index.html (run "npm run build" first if it is missing).
echo.
pause
exit /b 1

:node
node "%~dp0scripts\serve.mjs"
goto :end

:ps
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"
goto :end

:end
if errorlevel 1 pause
