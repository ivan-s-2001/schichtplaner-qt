@echo off
chcp 65001 >nul
setlocal EnableExtensions

cd /d "%~dp0"

if not exist ".env.symbiosis" (
  echo Creating .env.symbiosis with random local secrets...
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
  echo Keep your existing Outline authentication settings in that file.
  echo You can start from ..\Outline-osp\.env.sample.
  goto :fail
)

echo.
echo Building and starting Outline + Schichtplaner...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml up -d --build
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo STARTED
 echo Outline:      http://localhost:3000
 echo Schichtplaner: http://localhost:41873
 echo Database:     one PostgreSQL DB "outline"
 echo Schemas:      public + schedule
 echo Open Schichtplaner from the "Расписание" item in Outline.
echo ============================================================
start "" "http://localhost:3000"
exit /b 0

:fail
echo.
echo Failed to start the shared Docker stack.
pause
exit /b 1
