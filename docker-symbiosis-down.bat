@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".env.symbiosis" (
  echo ERROR: .env.symbiosis is missing.
  exit /b 1
)

docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml down
exit /b %errorlevel%
