@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".env.symbiosis" (
  echo ERROR: .env.symbiosis is missing. Run docker-symbiosis-up.bat first.
  exit /b 1
)

set "OUTLINE_DOMAIN=outline.qt.local"
set "SCHEDULE_DOMAIN=schedule.qt.local"
set "OUTLINE_PORT=3000"
set "SCHEDULE_PORT=41873"
set "MAILPIT_PORT=8025"

for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.symbiosis") do (
  if not "%%A"=="" set "%%A=%%B"
)

echo Checking Docker services...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml ps
if errorlevel 1 goto :fail

echo.
echo Checking Outline HTTPS and proxy configuration...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml exec -T outline node -e "if (!process.env.SECRET_KEY || !process.env.UTILS_SECRET) throw new Error('Outline secrets are missing'); if (!String(process.env.URL || '').startsWith('https://')) throw new Error('Outline URL is not HTTPS'); if (process.env.FORCE_HTTPS !== 'true') throw new Error('FORCE_HTTPS must be true'); if (process.env.PROXY_HEADERS_TRUSTED !== 'true') throw new Error('PROXY_HEADERS_TRUSTED must be true');"
if errorlevel 1 goto :fail

echo Checking Schedule authentication configuration...
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml exec -T schedule node -e "if (!process.env.AUTH_SECRET) throw new Error('AUTH_SECRET is missing'); if (!String(process.env.AUTH_URL || '').startsWith('https://')) throw new Error('AUTH_URL is not HTTPS'); if (!process.env.SCHEDULE_SSO_SECRET) throw new Error('SCHEDULE_SSO_SECRET is missing');"
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

for /f "usebackq delims=" %%D in (`docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml exec -T postgres psql -U outline -d outline -Atc "SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='schedule' AND c.relname='divisions';"`) do set "DIVISIONS_KIND=%%D"
if /I not "%DIVISIONS_KIND%"=="r" (
  echo ERROR: schedule.divisions must be an independent table, received relkind: %DIVISIONS_KIND%
  goto :fail
)

for /f "usebackq delims=" %%T in (`docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml exec -T postgres psql -U outline -d outline -Atc "SELECT COALESCE(to_regclass('schedule.outline_sso_tokens')::text, '');"`) do set "SSO_TABLE=%%T"
if /I not "%SSO_TABLE%"=="schedule.outline_sso_tokens" (
  echo ERROR: schedule.outline_sso_tokens is missing.
  goto :fail
)

for /f "usebackq delims=" %%F in (`docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml exec -T postgres psql -U outline -d outline -Atc "SELECT COUNT(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_class f ON f.oid=c.confrelid JOIN pg_namespace fn ON fn.oid=f.relnamespace WHERE n.nspname='schedule' AND fn.nspname='public' AND f.relname IN ('users','teams');"`) do set "DIRECT_FKS=%%F"
if "%DIRECT_FKS%"=="0" (
  echo ERROR: no direct foreign keys from schedule to Outline users or teams were found.
  goto :fail
)

echo Shared database schemas: %SCHEMAS%
echo Direct Outline foreign keys: %DIRECT_FKS%

echo.
echo Checking public HTTPS endpoints...
curl.exe -k -fsS "https://%OUTLINE_DOMAIN%/_health" | findstr /c:"OK" >nul
if errorlevel 1 goto :fail

curl.exe -k -fsS "https://%SCHEDULE_DOMAIN%/api/health" >nul
if errorlevel 1 goto :fail

curl.exe -fsS "http://localhost:%MAILPIT_PORT%/" >nul
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo CHECK PASSED
echo Outline:  https://%OUTLINE_DOMAIN%
echo Schedule: https://%SCHEDULE_DOMAIN%
echo Mailpit:  http://localhost:%MAILPIT_PORT%
echo ============================================================
exit /b 0

:fail
echo.
echo Symbiosis check failed. Review Docker logs:
echo docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200
exit /b 1
