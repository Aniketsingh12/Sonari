@echo off
REM ===================================================================
REM  Sonari - stop all servers (Windows)
REM ===================================================================
setlocal enabledelayedexpansion
title Sonari - stopping

echo.
echo   Stopping Sonari...
echo.

set found=0

REM Kill whatever is listening on the API and web ports.
REM netstat column order is:  Proto  Local  Foreign  State  PID
for %%P in (8100 5273) do (
  for /f "tokens=5" %%T in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do (
    echo   Stopping process %%T on port %%P
    taskkill /PID %%T /F >nul 2>&1
    set found=1
  )
)

REM Close the launcher's server windows if they're still open.
taskkill /FI "WINDOWTITLE eq Sonari API*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Sonari Web*" /F >nul 2>&1

if "!found!"=="0" (
  echo   Nothing was running.
) else (
  echo.
  echo   Sonari stopped.
)

echo.
REM ping is used as a sleep: it works even when stdin is redirected.
ping -n 3 127.0.0.1 >nul 2>&1
endlocal
