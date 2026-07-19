@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not exist ".env.symbiosis" (
  echo Creating .env.symbiosis with random scheduling secrets...
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create-symbiosis-env.ps1"
  if errorlevel 1 goto :fail
)

if not exist "..\Outline-osp\package.json" (
  echo ERROR: Outline-osp must be next to schichtplaner-qt.
  echo Expected: %CD%\..\Outline-osp
  goto :fail
)

if not exist "..\Outline-osp\.env" (
  echo ERROR: ..\Outline-osp\.env is missing.
  echo Keep the existing Outline SECRET_KEY and UTILS_SECRET in that file.
  goto :fail
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
  docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=150 outline schedule postgres
  goto :fail
)

call docker-symbiosis-check.bat
if errorlevel 1 goto :fail

echo.
echo Outline: http://localhost:3000
echo Schedule: http://localhost:41873
echo Open the schedule through the Outline sidebar.
start "" "http://localhost:3000"
exit /b 0

:fail
echo Shared Docker stack failed to start.
pause
exit /b 1
