@echo off
chcp 65001 >nul
setlocal EnableExtensions

cd /d "%~dp0"

docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml down
if errorlevel 1 (
  echo Failed to stop the shared Docker stack.
  pause
  exit /b 1
)

echo Outline and Schichtplaner stopped. PostgreSQL data was preserved.
exit /b 0
