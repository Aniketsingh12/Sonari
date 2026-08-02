@echo off
REM ===================================================================
REM  Sonari - one-click launcher (Windows)
REM  Double-click this file. It sets everything up on first run, starts
REM  the API + web app, and opens your browser.
REM ===================================================================
setlocal
cd /d "%~dp0"
title Sonari launcher

echo.
echo   Sonari - AI Voice Agents
echo   ==========================
echo.

REM ---- Prerequisite checks ------------------------------------------
where python >nul 2>&1
if errorlevel 1 (
  echo   [X] Python was not found on your PATH.
  echo       Install Python 3.11+ from https://python.org and re-run.
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js was not found on your PATH.
  echo       Install Node 18+ from https://nodejs.org and re-run.
  echo.
  pause
  exit /b 1
)

REM ---- Port check ---------------------------------------------------
REM netstat column order is:  Proto  Local  Foreign  State  PID
netstat -ano | findstr /r /c:":8100 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo   [!] Port 8100 is already in use - Sonari may already be running.
  echo       Close the old windows, or open http://localhost:5273
  echo.
  pause
  exit /b 1
)

REM ---- Backend setup ------------------------------------------------
if not exist "backend\.venv\Scripts\python.exe" (
  echo   [1/4] Creating Python environment ^(first run only^)...
  python -m venv "backend\.venv"
  if errorlevel 1 (
    echo   [X] Could not create the virtual environment.
    pause
    exit /b 1
  )
) else (
  echo   [1/4] Python environment ready.
)

echo   [2/4] Installing backend packages...
"backend\.venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r "backend\requirements.txt"
if errorlevel 1 (
  echo   [X] Backend packages failed to install.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  copy /y "backend\.env.example" "backend\.env" >nul
  echo         Created backend\.env ^(edit it to switch AI providers^).
)

REM ---- Frontend setup -----------------------------------------------
if not exist "frontend\node_modules" (
  echo   [3/4] Installing frontend packages ^(first run, may take a minute^)...
  pushd frontend
  call npm install --silent
  if errorlevel 1 (
    echo   [X] Frontend packages failed to install.
    popd
    pause
    exit /b 1
  )
  popd
) else (
  echo   [3/4] Frontend packages ready.
)

REM ---- Launch -------------------------------------------------------
echo   [4/4] Starting servers...
echo.

REM /D sets each window's working directory, so no nested quotes are needed
REM (and paths containing spaces still work).
REM No --reload here: uvicorn's reloader respawns itself with the *system*
REM Python rather than the venv's, which has no uvicorn installed. Devs who
REM want hot-reload should run uvicorn manually (see README).
start "Sonari API" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8100"
start "Sonari Web" /D "%~dp0frontend" cmd /k "npm run dev"

REM ---- Wait for the API to answer -----------------------------------
echo   Waiting for the API to come up...
set tries=0
:waitapi
curl -s -o nul http://127.0.0.1:8100/api/health
if not errorlevel 1 goto apiready
set /a tries+=1
if %tries% geq 60 goto apitimeout
REM ping is used as a sleep: it works even when stdin is redirected.
ping -n 2 127.0.0.1 >nul 2>&1
goto waitapi

:apitimeout
echo   [!] The API did not respond in time. Check the "Sonari API" window.
echo.
pause
exit /b 1

:apiready
echo   API is up.

REM ---- Wait for the web app -----------------------------------------
REM Use localhost, not 127.0.0.1: Vite binds to IPv6 (::1) on Windows.
set tries=0
:waitweb
curl -s -o nul http://localhost:5273/
if not errorlevel 1 goto webready
set /a tries+=1
if %tries% geq 40 goto webready
ping -n 2 127.0.0.1 >nul 2>&1
goto waitweb

:webready
echo   Web app is up.
echo.
start "" http://localhost:5273

echo   ==========================================================
echo     Sonari is running.
echo.
echo       Dashboard : http://localhost:5273
echo       API docs  : http://localhost:8100/docs
echo.
echo     Two server windows opened. Closing them stops Sonari,
echo     or just run stop.bat.
echo   ==========================================================
echo.
ping -n 9 127.0.0.1 >nul 2>&1
endlocal
