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
2. Пункт «Расписание» вызывает `/api/schedule.open`.
3. Outline создаёт одноразовый HS256 SSO-токен сроком на 60 секунд.
4. Schedule проверяет подпись и помечает `jti` использованным.
5. Сессия Schedule содержит UUID пользователя Outline.

Прямой вход по email в Schedule отключён.

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

Docker Compose запускает Outline, Schedule, PostgreSQL, Redis и Mailpit.

Сервисы:

- Outline: `http://localhost:3000`;
- Schedule: `http://localhost:41873`;
- Mailpit: `http://localhost:8025`;
- PostgreSQL: одна внутренняя Docker-база `outline`;
- схемы PostgreSQL: `public` и `schedule`.
