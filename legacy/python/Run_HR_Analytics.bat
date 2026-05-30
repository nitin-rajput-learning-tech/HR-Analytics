@echo off
setlocal EnableExtensions

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

set "VENV_DIR=%APP_DIR%.venv_hr_analytics"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "REQ_FILE=%APP_DIR%requirements.txt"
set "SRC_DIR=%APP_DIR%src"
set "WORKSPACE_DIR=%APP_DIR%.workspace"

if not exist "%SRC_DIR%\hr_analytics\streamlit_app.py" (
  echo [ERROR] Cannot find app sources under "%SRC_DIR%".
  pause
  exit /b 1
)

set "PY_BOOTSTRAP="
where py >nul 2>nul
if not errorlevel 1 (
  py -3.11 -c "import sys" >nul 2>nul
  if not errorlevel 1 set "PY_BOOTSTRAP=py -3.11"
)

if not defined PY_BOOTSTRAP (
  where python >nul 2>nul
  if not errorlevel 1 set "PY_BOOTSTRAP=python"
)

if not defined PY_BOOTSTRAP (
  echo [ERROR] Python 3.11+ not found.
  echo Install Python 3.11 and re-run this launcher.
  pause
  exit /b 1
)

if not exist "%VENV_PY%" (
  echo Creating local runtime...
  call %PY_BOOTSTRAP% -m venv "%VENV_DIR%"
  if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
  )
)

echo Checking dependencies...
"%VENV_PY%" -m pip install --upgrade pip >nul
"%VENV_PY%" -m pip install -r "%REQ_FILE%"
if errorlevel 1 (
  echo [ERROR] Dependency installation failed.
  pause
  exit /b 1
)

if not exist "%WORKSPACE_DIR%" mkdir "%WORKSPACE_DIR%"

set "PYTHONPATH=%SRC_DIR%"
set "HR_ANALYTICS_WORKSPACE=%WORKSPACE_DIR%"

echo Starting HR Analytics...
"%VENV_PY%" -m hr_analytics.desktop

if errorlevel 1 (
  echo.
  echo [ERROR] HR Analytics exited with an error.
  pause
  exit /b 1
)

exit /b 0
