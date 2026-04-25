@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js 20+ first:
  echo https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please reinstall Node.js with npm enabled.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Uri 'http://localhost:3099/api/status' -TimeoutSec 2 | Out-Null; Start-Process 'http://localhost:3099'; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo AutoSimTrade is already running.
  pause
  exit /b 0
)

if not exist "node_modules\playwright-core" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "AutoSimTrade Server" /min cmd /c "node server.js"
timeout /t 2 /nobreak >nul
start http://localhost:3099
echo AutoSimTrade started: http://localhost:3099
pause
