# Интеграция Outline + Schedule

Полная инструкция запуска находится в корневом [`README.md`](../README.md).

## Источник данных

Outline является единственным источником личных данных:

- `public.users` — пользователи;
- `public.teams` — рабочие пространства;
- `public.groups` и `public.group_users` — только права доступа к документам.

Сервис расписания не копирует ФИО, email, аватары и языки пользователей.

Для совместимости Prisma схема `schedule` содержит read-only представления над данными Outline, включая `schedule.users`.

## Подразделения расписания

Подразделения расписания не являются группами доступа Outline.

Они хранятся в собственных таблицах:

- `schedule.divisions`;
- `schedule.division_members`.

У сотрудника может быть только одно основное подразделение. Подразделение имеет руководителя, цвет и тип графика `SHIFT` или `STABLE`.

## Миграции

Единственный владелец миграций общей базы — Outline.

При старте контейнера Outline выполняется:

```bash
./node_modules/.bin/sequelize db:migrate
```

Эти миграции создают и обновляют схему `schedule`. Контейнер Schedule выполняет только `prisma generate` во время сборки и не запускает `prisma migrate deploy`, `prisma migrate dev` или `prisma db push`.

## Авторизация

1. Пользователь входит в Outline.
2. Пункт «График» или «Отпуска» вызывает защищённый API Outline.
3. Outline создаёт HS256 SSO-токен со сроком действия 60 секунд и уникальным `jti`.
4. Schedule проверяет алгоритм, подпись, issuer, audience, UUID, срок действия и максимальную продолжительность токена.
5. `jti` атомарно записывается в `schedule.outline_sso_tokens`; повторное использование отклоняется.
6. Параметр `token` сразу удаляется из адресной строки, после чего Schedule создаёт собственную защищённую сессию.

Постоянная подпись `userId:teamId` больше не используется. Прямой вход по email в Schedule отключён.

## HTTPS и CSRF

Caddy входит в основной `docker-compose.symbiosis.yml` и является единственной публичной точкой входа:

- `https://outline.qt.local` → `outline:3000`;
- `https://schedule.qt.local` → `schedule:3000`.

Outline получает `X-Forwarded-Proto: https`, работает с `FORCE_HTTPS=true` и доверяет заголовкам встроенного proxy. Это необходимо для корректных secure cookies и CSRF.

`OUTLINE_SECRET_KEY`, `OUTLINE_UTILS_SECRET`, `NEXTAUTH_SECRET` и `SCHEDULE_SSO_SECRET` создаются один раз в `.env.symbiosis` и не должны меняться при пересборке. Скрипт импортирует существующий `SECRET_KEY` из `outline.qt.local/.env`, чтобы обновление не аннулировало текущие сессии и зашифрованные данные.

## Docker

Репозитории располагаются рядом:

```text
C:\OSPanel\home\
├── outline.qt.local\
└── schedule.qt.local\
```

Open Server Panel не используется. Каталог `C:\OSPanel\home` является только местом хранения файлов.

Запуск выполняется из `schedule.qt.local`:

```powershell
.\docker-symbiosis-up.bat
```

Первый запуск добавляет локальные домены в `hosts`, устанавливает корневой сертификат Caddy и включает использование системного хранилища сертификатов в Firefox.

Сервисы:

- Outline: `https://outline.qt.local`;
- Schedule: `https://schedule.qt.local`;
- Mailpit: `http://localhost:8025`;
- диагностический Outline HTTP: `http://127.0.0.1:3000`;
- диагностический Schedule HTTP: `http://127.0.0.1:41873`;
- PostgreSQL: одна внутренняя Docker-база `outline`;
- схемы PostgreSQL: `public`, `schedule` и `attestation`.

## Realtime

Production-образ Schedule запускает `server.cjs`, который поднимает Next.js и Socket.IO на одном порту. Socket.IO:

- принимает cookies только с origin Schedule;
- проверяет сессию через Auth.js;
- загружает активного пользователя из `public.users`;
- автоматически подключает пользователя только к комнате его workspace;
- разрешает комнату графика только если график принадлежит тому же workspace;
- не принимает от клиента команды на произвольную ретрансляцию событий.
