@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if /I "%~1"=="--offline" goto :after_git_pull

if /I not "%~1"=="--skip-git-pull" (
  echo Updating repositories before Docker build...
  call "%~dp0gitpull.bat"
  if errorlevel 1 (
    echo.
    echo Automatic repository update failed.
    echo Run docker-symbiosis-up.bat --offline to use the local checkout.
    pause
    exit /b 1
  )

  echo.
  echo Restarting the updated startup script...
  call "%~f0" --skip-git-pull
  exit /b !errorlevel!
)

:after_git_pull
echo Preparing stable Docker secrets...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create-symbiosis-env.ps1"
if errorlevel 1 goto :fail

if not exist "..\outline.qt.local\package.json" (
  echo ERROR: Outline repository was not found.
  echo Expected path: C:\OSPanel\home\outline.qt.local
  echo Clone it with:
  echo git clone https://github.com/ivan-s-2001/Outline-osp.git C:\OSPanel\home\outline.qt.local
  goto :fail
)

echo Preparing the Outline environment...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create-outline-env.ps1"
if errorlevel 1 goto :fail

echo Configuring local domain names...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\configure-local-https.ps1" -ProjectDir "%CD%" -Phase Hosts
if errorlevel 1 goto :fail

set "OUTLINE_DOMAIN=outline.qt.local"
set "SCHEDULE_DOMAIN=schedule.qt.local"
set "OUTLINE_URL=https://outline.qt.local"
set "SCHEDULE_URL=https://schedule.qt.local"
set "OUTLINE_PORT=3000"
set "SCHEDULE_PORT=41873"
set "MAILPIT_PORT=8025"

for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.symbiosis") do (
  if not "%%A"=="" set "%%A=%%B"
)

echo Removing obsolete standalone HTTPS proxy containers...
for %%C in (schedule-local-https plane-local-https outline-schedule-local-https) do (
  docker ps -a --format "{{.Names}}" | findstr /x /c:"%%C" >nul 2>&1
  if not errorlevel 1 docker rm -f "%%C" >nul
)

echo Validating Docker Compose configuration...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml config --quiet
if errorlevel 1 goto :fail

echo Building and starting the Docker stack...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml up -d --build --remove-orphans
if errorlevel 1 goto :fail

echo Waiting for migrations, health checks, and HTTPS...
set "READY=0"
for /L %%I in (1,1,180) do (
  call docker-symbiosis-check.bat --quiet >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto :ready
  )
  timeout /t 2 /nobreak >nul
)

:ready
if not "!READY!"=="1" (
  docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml ps
  docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200 outline schedule proxy postgres redis mailpit
  goto :fail
)

echo Installing the local HTTPS certificate...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\configure-local-https.ps1" -ProjectDir "%CD%" -Phase Trust
if errorlevel 1 goto :fail

call docker-symbiosis-check.bat
if errorlevel 1 goto :fail

echo.
echo Outline:  !OUTLINE_URL!
echo Schedule: !SCHEDULE_URL!
echo Mailpit:  http://localhost:!MAILPIT_PORT!
echo.
echo Direct HTTP ports are available only on this computer for diagnostics:
echo Outline:  http://127.0.0.1:!OUTLINE_PORT!
echo Schedule: http://127.0.0.1:!SCHEDULE_PORT!
echo.
echo Restart Firefox completely after the first certificate installation.
start "" "!OUTLINE_URL!"
exit /b 0

:fail
echo.
echo Docker stack failed to start.
echo Review:
echo docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml ps
echo docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200
pause
exit /b 1
