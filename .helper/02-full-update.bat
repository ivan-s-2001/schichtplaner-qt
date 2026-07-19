@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0.."

if not exist "docker-compose.symbiosis.yml" (
  echo ERROR: docker-compose.symbiosis.yml was not found.
  pause
  exit /b 1
)

if not exist ".env.symbiosis" (
  echo ERROR: .env.symbiosis was not found.
  echo Run docker-symbiosis-up.bat before using the reset helper.
  pause
  exit /b 1
)

echo.
echo WARNING: THIS DELETES THE COMPLETE LOCAL INSTALLATION.
echo PostgreSQL, Outline documents, users, schedules, Redis data,
echo uploaded files, and local Caddy data will be removed.
echo.
set /p CONFIRM=Type DELETE-ALL to continue: 

if /I not "%CONFIRM%"=="DELETE-ALL" (
  echo Reset cancelled.
  pause
  exit /b 0
)

echo.
echo Removing all Docker containers and volumes...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml down -v --remove-orphans
if errorlevel 1 goto :fail

echo Removing generated environment files...
del /f /q ".env.symbiosis" >nul 2>&1
del /f /q "..\outline.qt.local\.env" >nul 2>&1

if exist ".symbiosis-https" rmdir /s /q ".symbiosis-https"

echo.
echo Creating a clean installation...
call docker-symbiosis-up.bat
if errorlevel 1 goto :fail

exit /b 0

:fail
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
echo.
echo Full reset failed with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
