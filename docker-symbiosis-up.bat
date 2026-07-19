@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

if not exist ".env.symbiosis" (
  echo Creating .env.symbiosis with random local scheduling secrets...
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create-symbiosis-env.ps1"
  if errorlevel 1 goto :fail
)

if not exist "..\Outline-osp\package.json" (
  echo.
  echo ERROR: Outline-osp must be next to schichtplaner-qt.
  echo Expected: %CD%\..\Outline-osp
  goto :fail
)

if not exist "..\Outline-osp\.env" (
  echo.
  echo ERROR: ..\Outline-osp\.env is missing.
  echo Keep the existing Outline SECRET_KEY, UTILS_SECRET, authentication,
  echo mail, and storage settings in that file.
  echo You can start from ..\Outline-osp\.env.sample for a new installation.
  goto :fail
)

echo.
echo Building and starting Outline + Schichtplaner...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml up -d --build
if errorlevel 1 goto :fail

echo.
echo Waiting for the shared stack to become ready...
set "READY=0"
for /L %%I in (1,1,90) do (
  call docker-symbiosis-check.bat >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto :ready
  )
  timeout /t 2 /nobreak >nul
)

:ready
if not "!READY!"=="1" (
  echo.
  echo ERROR: services did not become ready.
  docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml ps
  echo.
  echo Last logs:
  docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=100 outline schedule schedule-migrate postgres
  goto :fail
)

call docker-symbiosis-check.bat
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo STARTED
 echo Outline:       http://localhost:3000
 echo Schichtplaner: http://localhost:41873
 echo Database:      one PostgreSQL DB "outline"
 echo Schemas:       public + schedule
 echo Open Schichtplaner from the "Расписание" item in Outline.
echo ============================================================
start "" "http://localhost:3000"
exit /b 0

:fail
echo.
echo Failed to start the shared Docker stack.
pause
exit /b 1
