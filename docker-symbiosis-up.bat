@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not exist ".env.symbiosis" (
  echo Creating schedule .env.symbiosis with random secrets...
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create-symbiosis-env.ps1"
  if errorlevel 1 goto :fail
)

if not exist "..\outline.qt.local\package.json" (
  echo ERROR: Outline repository was not found.
  echo Expected path: C:\OSPanel\home\outline.qt.local
  echo Clone it with:
  echo git clone https://github.com/ivan-s-2001/Outline-osp.git C:\OSPanel\home\outline.qt.local
  goto :fail
)

if not exist "..\outline.qt.local\.env" (
  echo Creating Outline .env for local Docker launch...
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create-outline-env.ps1"
  if errorlevel 1 goto :fail
)

echo Building and starting Outline + Schedule...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml up -d --build
if errorlevel 1 goto :fail

echo Waiting for Outline migrations and both applications...
set "READY=0"
for /L %%I in (1,1,120) do (
  call docker-symbiosis-check.bat >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto :ready
  )
  timeout /t 2 /nobreak >nul
)

:ready
if not "!READY!"=="1" (
  docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml ps
  docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=150 outline schedule postgres redis mailpit
  goto :fail
)

call docker-symbiosis-check.bat
if errorlevel 1 goto :fail

echo.
echo Outline:  http://localhost:3000
echo Schedule: http://localhost:41873
echo Mailpit:  http://localhost:8025
echo.
echo Sign in to Outline by email, then open the login message in Mailpit.
echo Open Schedule only through the Outline sidebar.
start "" "http://localhost:3000"
exit /b 0

:fail
echo.
echo Shared Docker stack failed to start.
pause
exit /b 1
