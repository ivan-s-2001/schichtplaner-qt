@echo off
chcp 65001 >nul
setlocal EnableExtensions

cd /d "%~dp0"

if not exist ".env.symbiosis" (
  echo ERROR: .env.symbiosis is missing. Run docker-symbiosis-up.bat first.
  exit /b 1
)

echo Checking Docker services...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml ps
if errorlevel 1 goto :fail

echo.
echo Checking the shared PostgreSQL database...
for /f "usebackq delims=" %%S in (`docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml exec -T postgres psql -U outline -d outline -Atc "SELECT string_agg(schema_name, ', ' ORDER BY schema_name) FROM information_schema.schemata WHERE schema_name IN ('public', 'schedule');"`) do set "SCHEMAS=%%S"

if /I not "%SCHEMAS%"=="public, schedule" (
  echo ERROR: expected schemas public, schedule; received: %SCHEMAS%
  goto :fail
)

echo Shared database schemas: %SCHEMAS%

echo.
echo Checking Outline health...
powershell -NoProfile -Command "$response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/_health' -TimeoutSec 10; if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) { exit 1 }"
if errorlevel 1 goto :fail

echo Checking Schichtplaner HTTP response...
powershell -NoProfile -Command "$response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:41873/' -TimeoutSec 10; if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) { exit 1 }"
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo CHECK PASSED
 echo One PostgreSQL database: outline
 echo Outline schema: public
 echo Schedule schema: schedule
 echo Outline: http://localhost:3000
 echo Schedule: http://localhost:41873
 echo SSO entry: http://localhost:3000/api/schedule.open
echo ============================================================
exit /b 0

:fail
echo.
echo Symbiosis check failed. Review Docker logs:
echo docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200
exit /b 1
