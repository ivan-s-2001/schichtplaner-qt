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

for /f "usebackq delims=" %%R in (`docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml exec -T postgres psql -U outline -d outline -Atc "SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='schedule' AND c.relname='users';"`) do set "USERS_KIND=%%R"
if /I not "%USERS_KIND%"=="v" (
  echo ERROR: schedule.users must be a view over public.users, received relkind: %USERS_KIND%
  goto :fail
)

for /f "usebackq delims=" %%F in (`docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml exec -T postgres psql -U outline -d outline -Atc "SELECT COUNT(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_class f ON f.oid=c.confrelid JOIN pg_namespace fn ON fn.oid=f.relnamespace WHERE n.nspname='schedule' AND fn.nspname='public' AND f.relname IN ('users','groups','teams');"`) do set "DIRECT_FKS=%%F"
if "%DIRECT_FKS%"=="0" (
  echo ERROR: no direct foreign keys from schedule to Outline tables were found.
  goto :fail
)

echo Shared database schemas: %SCHEMAS%
echo Direct Outline foreign keys: %DIRECT_FKS%

echo.
echo Checking Outline health...
powershell -NoProfile -Command "$response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/_health' -TimeoutSec 10; if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) { exit 1 }"
if errorlevel 1 goto :fail

echo Checking Schedule HTTP response...
powershell -NoProfile -Command "$response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:41873/' -TimeoutSec 10; if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) { exit 1 }"
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo CHECK PASSED
echo One PostgreSQL database: outline
echo Outline data: public
echo Schedule-only data: schedule
echo Personal data is not copied into schedule
echo ============================================================
exit /b 0

:fail
echo.
echo Symbiosis check failed. Review Docker logs:
echo docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200
exit /b 1
