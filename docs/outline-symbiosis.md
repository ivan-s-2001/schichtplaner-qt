# Outline + расписание

## Источник данных

Outline является единственным источником пользователей и отделов:

- `public.users.id` — идентификатор сотрудника;
- `public.groups.id` — идентификатор отдела;
- `public.group_users` — членство сотрудника в отделе;
- `public.teams.id` — технический идентификатор единственного workspace.

В схеме `schedule` не хранятся ФИО, email, аватары, языки, копии пользователей, копии групп или отдельная организация.

Для совместимости Prisma миграции Outline создают read-only представления:

- `schedule.users` → `public.users`;
- `schedule.organizations` → `public.teams`;
- `schedule.organization_members` → активные пользователи Outline;
- `schedule.divisions` → `public.groups`;
- `schedule.division_members` → `public.group_users`.

Представления не содержат собственных данных. Все внешние ключи рабочих таблиц направлены непосредственно в `public.users`, `public.groups` и `public.teams`.

## Что хранится в `schedule`

Только данные, относящиеся к работе:

- недельные графики;
- смены и назначения;
- выходные;
- отпуска и больничные;
- категории отсутствий;
- учёт времени;
- праздничные дни;
- заметки к графику;
- пул шаблонов смен;
- одноразовые SSO-токены.

Портал и весь AI-функционал удалены.

## Миграции

Единственный владелец миграций общей базы — Outline.

При запуске контейнера Outline выполняется:

```bash
./node_modules/.bin/sequelize db:migrate
```

Эти миграции создают и обновляют схему `schedule`. Schichtplaner выполняет только `prisma generate` при сборке и не запускает `prisma migrate deploy`.

## Авторизация

1. Пользователь входит в Outline.
2. Пункт «Расписание» открывает `/api/schedule.open`.
3. Outline выдаёт HS256-токен сроком на 60 секунд.
4. Schichtplaner проверяет подпись и отмечает `jti` использованным.
5. Сессия содержит UUID пользователя Outline.
6. Доступные отделы читаются из `public.group_users` при каждом запросе.

## Docker

Репозитории должны располагаться рядом:

```text
project/
├── Outline-osp/
└── schichtplaner-qt/
```

В `Outline-osp/.env` сохраняются существующие `SECRET_KEY`, `UTILS_SECRET`, настройки почты и хранилища.

Запуск в Windows:

```bat
docker-symbiosis-up.bat
```

Проверка:

```bat
docker-symbiosis-check.bat
```

Остановка без удаления данных:

```bat
docker-symbiosis-down.bat
```

Сервисы:

- Outline: `http://localhost:3000`;
- расписание: `http://localhost:41873`;
- PostgreSQL: одна база `outline`;
- схемы: `public` и `schedule`.

## Тема и язык

- тема расписания хранится в браузере под отдельным ключом `schichtplaner-theme` и не связана с темой Outline;
- язык расписания выбирается в персональных настройках и хранится локально;
- личные поля пользователя в БД расписания не создаются.
