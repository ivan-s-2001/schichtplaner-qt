@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0.."

if not exist "docker-symbiosis-up.bat" (
  echo ERROR: docker-symbiosis-up.bat was not found.
  pause
  exit /b 1
)

echo Updating and rebuilding the supported Outline + Schedule stack...
call docker-symbiosis-up.bat
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Symbiosis update failed with code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
