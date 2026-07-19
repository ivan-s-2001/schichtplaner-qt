# Contributing to Outline + Schedule

Schedule является частью связки из двух репозиториев:

- `ivan-s-2001/Outline-osp` — пользователи, рабочие пространства, вход и миграции общей базы;
- `ivan-s-2001/schichtplaner-qt` — интерфейс и бизнес-логика графиков.

## Требования

Для штатного запуска нужны:

- Git;
- Docker Desktop с Docker Compose.

Локальные Node.js, PostgreSQL, Redis и Prisma CLI для обычного запуска не требуются.

## Установка

Репозитории должны находиться рядом:

```text
C:\OSPanel\home\
├── outline.qt.local\
└── schedule.qt.local\
```

Запуск:

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
.\docker-symbiosis-up.bat
```

Запуск текущей ветки без автоматического обновления `main`:

```powershell
.\docker-symbiosis-up.bat --offline
```

Основные адреса:

- `https://outline.qt.local`;
- `https://schedule.qt.local`;
- `http://localhost:8025` — Mailpit.

## Рабочий процесс

1. Создайте issue или зафиксируйте техническую задачу.
2. Создайте одинаково названные ветки в обоих репозиториях, если меняется интеграционный контракт.
3. Не добавляйте `.env`, `.env.symbiosis`, сертификаты и приватные данные.
4. Выполните проверки.
5. Откройте связанные PR в оба репозитория.
6. Сначала проверьте совместный Docker-запуск, затем сливайте обе части.

## Проверки Schedule

```powershell
npm ci --legacy-peer-deps
npx prisma generate
npm run sso:check
npx tsc --noEmit
npm run build
docker build -t schedule-local-check .
```

Проверка интеграционного стека:

```powershell
.\docker-symbiosis-check.bat
```

## Владение базой данных

Единственный владелец миграций общей базы — Outline.

Нельзя выполнять в Schedule:

```text
prisma migrate dev
prisma migrate deploy
prisma migrate reset
prisma db push
```

При изменении схемы:

1. обновите `prisma/schema.prisma` как клиентское описание;
2. добавьте Sequelize-миграцию в `Outline-osp/server/migrations`;
3. добавьте её в `Outline-osp/server/scripts/export-schedule-migration-sql.js`;
4. обновите schema-contract проверки в обоих репозиториях;
5. выполните `npx prisma generate` только для генерации клиента.

Schedule не должен создавать собственную историю Prisma migrations.

## Авторизация

Outline является единственной точкой входа. Контракт SSO должен сохранять:

- алгоритм `HS256`;
- `typ=JWT`;
- `iss=outline`;
- `aud=schichtplaner`;
- UUID пользователя и workspace;
- срок действия не более пяти минут; issuer использует 60 секунд;
- уникальный одноразовый `jti`;
- общий стабильный `SCHEDULE_SSO_SECRET`.

При изменении SSO обязательно обновляйте issuer Outline, verifier Schedule и `npm run sso:check`.

## API

Каждый mutating route должен:

1. получить текущего пользователя через `getCurrentMember()`;
2. проверить роль и workspace;
3. валидировать вход через Zod или эквивалентную строгую проверку;
4. ограничить запрос `organizationId/teamId` текущего пользователя;
5. не доверять идентификаторам workspace, присланным клиентом;
6. возвращать корректные коды `401`, `403`, `404` и `422/400`.

## Realtime

Socket.IO работает через `server.cjs` и `/api/ws`.

Нельзя:

- принимать произвольный `orgId` от клиента;
- разрешать произвольную ретрансляцию событий;
- подключать к комнате графика без проверки workspace;
- запускать production через стандартный `next start`, обходя custom server.

## HTTPS и browser messaging

TLS завершается на Caddy из `docker-compose.symbiosis.yml`.

- публичные URL всегда HTTPS;
- внутренний трафик контейнеров может быть HTTP;
- `X-Forwarded-Proto` должен передаваться Outline;
- `SECRET_KEY` и Auth.js secrets нельзя ротировать при пересборке;
- `postMessage` должен использовать точный origin, не `*`;
- Schedule разрешается в iframe только origin Outline.

## Коммиты и ветки

Рекомендуемые префиксы:

```text
feat: новая возможность
fix: исправление
security: усиление безопасности
docs: документация
refactor: переработка без изменения поведения
chore: обслуживание
```

Основная ветка — `main`. Рабочие ветки — `feature/*` и `fix/*`.
