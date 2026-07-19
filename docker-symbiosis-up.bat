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
    echo To start the existing local version without Git update, run:
    echo docker-symbiosis-up.bat --offline
    pause
    exit /b 1
  )

  echo.
  echo Restarting the updated startup script...
  call "%~f0" --skip-git-pull
  exit /b !errorlevel!
)

:after_git_pull
if not exist ".env.symbiosis" (
  echo Creating Docker .env.symbiosis with random secrets...
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
  echo Creating Outline .env for Docker...
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create-outline-env.ps1"
  if errorlevel 1 goto :fail
)

set "OUTLINE_PORT=3000"
set "SCHEDULE_PORT=41873"
set "MAILPIT_PORT=8025"
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.symbiosis") do (
  if not "%%A"=="" set "%%A=%%B"
)

echo Building and starting the Docker stack...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml up -d --build
if errorlevel 1 goto :fail

echo Waiting for migrations and application health checks...
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
echo Outline:  http://localhost:!OUTLINE_PORT!
echo Schedule: http://localhost:!SCHEDULE_PORT!
echo Mailpit:  http://localhost:!MAILPIT_PORT!
echo.
echo The C:\OSPanel\home folder is used only as a storage location.
echo Open Server is not required and is not used.
echo Sign in to Outline by email, then open the login message in Mailpit.
echo Open Schedule through the Outline sidebar.
start "" "http://localhost:!OUTLINE_PORT!"
exit /b 0

:fail
echo.
echo Docker stack failed to start.
pause
exit /b 1
