# Outline + Schedule

Единая локальная Docker-установка Outline и сервиса графиков.

Приложения работают через Docker Compose и открываются по локальным HTTPS-доменам:

- `https://outline.qt.local`;
- `https://schedule.qt.local`.

Open Server Panel не используется. Каталог `C:\OSPanel\home` служит только местом хранения репозиториев.

## Состав установки

`docker-compose.symbiosis.yml` запускает шесть сервисов:

- `proxy` — Caddy, HTTPS и единая публичная точка входа;
- `outline` — база знаний и основной вход пользователей;
- `schedule` — графики, отпуска и realtime-обновления;
- `postgres` — общая база данных `outline`;
- `redis` — служебное хранилище;
- `mailpit` — локальная почта для входа в Outline.

В PostgreSQL используются схемы:

- `public` — данные Outline и пользователей;
- `schedule` — графики, смены и подразделения;
- `attestation` — аттестация.

Личные данные пользователей не копируются в таблицы Schedule.

---

## 1. Требования

Установите и запустите:

- Git;
- Docker Desktop с Docker Compose.

Проверка в PowerShell:

```powershell
git --version
docker version
docker compose version
```

Open Server Panel запускать не нужно.

---

## 2. Клонирование

```powershell
Set-Location C:\OSPanel\home

git clone https://github.com/ivan-s-2001/Outline-osp.git .\outline.qt.local
git clone https://github.com/ivan-s-2001/schichtplaner-qt.git .\schedule.qt.local
```

Структура:

```text
C:\OSPanel\home\
├── outline.qt.local\
│   ├── package.json
│   ├── Dockerfile.symbiosis
│   └── ...
└── schedule.qt.local\
    ├── docker-compose.symbiosis.yml
    ├── Caddyfile.symbiosis
    ├── docker-symbiosis-up.bat
    ├── docker-symbiosis-check.bat
    └── ...
```

Папки должны находиться рядом. Compose использует путь `..\outline.qt.local`.

---

## 3. Первый запуск

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
.\docker-symbiosis-up.bat
```

Скрипт автоматически:

1. обновит оба репозитория, если не указан `--offline`;
2. создаст или дополнит `.env.symbiosis`;
3. сохранит существующие секреты и импортирует текущий `SECRET_KEY` Outline;
4. подготовит `outline.qt.local\.env` без ротации ключей;
5. добавит `outline.qt.local` и `schedule.qt.local` в Windows `hosts`;
6. соберёт Outline и Schedule;
7. запустит PostgreSQL, Redis, Mailpit и Caddy;
8. выполнит миграции Outline;
9. проверит общую базу, SSO, healthcheck и HTTPS;
10. установит локальный корневой сертификат Caddy в Windows;
11. откроет Outline.

Для запуска локальной версии без `git pull`:

```powershell
.\docker-symbiosis-up.bat --offline
```

Вручную запускать `npm`, `yarn`, Prisma или Sequelize не нужно.

После первой установки сертификата полностью закройте все окна Firefox и откройте браузер снова.

---

## 4. Адреса

| Сервис | Основной адрес |
|---|---|
| Outline | `https://outline.qt.local` |
| Schedule | `https://schedule.qt.local` |
| Mailpit | `http://localhost:8025` |

Диагностические HTTP-порты доступны только на текущем компьютере:

| Сервис | Диагностический адрес |
|---|---|
| Outline | `http://127.0.0.1:3000` |
| Schedule | `http://127.0.0.1:41873` |

Пользователь должен входить через `https://outline.qt.local`. Schedule открывается через разделы «График» и «Отпуска» внутри Outline.

Не используйте:

```text
https://localhost:3000
https://localhost:41873
http://localhost:3000
```

---

## 5. Первый вход

1. Откройте `https://outline.qt.local`.
2. Введите email.
3. Откройте `http://localhost:8025`.
4. Откройте письмо Outline.
5. Перейдите по ссылке входа.
6. Создайте рабочее пространство.

Mailpit не отправляет письма в интернет.

---

## 6. Настройка графика

После входа администратором:

1. откройте настройки Outline;
2. перейдите в подразделения;
3. создайте подразделение;
4. выберите режим `SHIFT` или `STABLE`;
5. назначьте руководителя и сотрудников;
6. задайте нормы времени;
7. откройте «График».

У сотрудника может быть только одно основное подразделение.

---

## 7. Авторизация и SSO

Outline является единственной точкой входа.

При открытии Schedule:

1. Outline проверяет свою сессию;
2. создаёт одноразовый HS256-токен на 60 секунд;
3. Schedule проверяет подпись, issuer, audience, UUID и срок действия;
4. идентификатор `jti` записывается в `schedule.outline_sso_tokens`;
5. повторное использование токена отклоняется;
6. параметр токена удаляется из адресной строки;
7. Schedule создаёт собственную Auth.js-сессию.

Секреты должны оставаться постоянными:

```env
OUTLINE_SECRET_KEY=...
OUTLINE_UTILS_SECRET=...
NEXTAUTH_SECRET=...
SCHEDULE_SSO_SECRET=...
```

Не удаляйте `.env.symbiosis` и `outline.qt.local\.env` при обычном обновлении.

---

## 8. Проверка установки

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
.\docker-symbiosis-check.bat
```

Проверяются:

- состояния контейнеров;
- HTTPS-конфигурация Outline и Schedule;
- постоянные секреты;
- Auth.js и SSO;
- схемы `public` и `schedule`;
- представление `schedule.users`;
- таблицы подразделений и одноразовых токенов;
- внешние ключи на пользователей Outline;
- Outline, Schedule и Mailpit.

Состояние Compose:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml ps
```

---

## 9. Журналы

Все сервисы:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs -f
```

Основные приложения и proxy:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs -f outline schedule proxy
```

Последние 200 строк:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200 outline schedule proxy postgres redis mailpit
```

`Ctrl+C` прекращает просмотр, но не останавливает контейнеры.

---

## 10. Остановка и перезапуск

Остановить без удаления данных:

```powershell
.\docker-symbiosis-down.bat
```

Повторный запуск:

```powershell
.\docker-symbiosis-up.bat
```

Перезапустить приложения без пересборки:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml restart outline schedule proxy
```

Обычный `down` сохраняет PostgreSQL, документы, вложения, Redis, сертификаты и графики.

---

## 11. Обновление

Обычный способ:

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
.\docker-symbiosis-up.bat
```

Скрипт обновляет оба репозитория и пересобирает изменившиеся образы.

Запуск уже загруженного кода без сети:

```powershell
.\docker-symbiosis-up.bat --offline
```

Docker volumes не удаляются.

---

## 12. Домены и диагностические порты

Файл:

```text
C:\OSPanel\home\schedule.qt.local\.env.symbiosis
```

Стандартные значения:

```env
OUTLINE_DOMAIN=outline.qt.local
OUTLINE_URL=https://outline.qt.local
OUTLINE_PORT=3000

SCHEDULE_DOMAIN=schedule.qt.local
SCHEDULE_URL=https://schedule.qt.local
SCHEDULE_PORT=41873

MAILPIT_PORT=8025
```

`OUTLINE_PORT` и `SCHEDULE_PORT` относятся только к loopback-диагностике. Публичный HTTPS использует порты `80` и `443` через Caddy.

При смене домена одновременно измените `*_DOMAIN` и соответствующий `*_URL`, затем снова запустите `docker-symbiosis-up.bat`.

---

## 13. Полный сброс

> Следующие команды безвозвратно удаляют базу, пользователей, документы, графики и сертификаты.

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml down -v --remove-orphans
Remove-Item .\.env.symbiosis -Force
Remove-Item ..\outline.qt.local\.env -Force
.\docker-symbiosis-up.bat --offline
```

Не используйте `down -v` для обычного обновления.

---

## 14. Типовые ошибки

### `CSRF token invalid`

Причины: старый HTTP-cookie, сменившийся `SECRET_KEY` или открытый старый адрес.

1. Убедитесь, что открываете `https://outline.qt.local`.
2. Закройте старые вкладки `localhost:3000`.
3. Полностью перезапустите Firefox.
4. При необходимости один раз удалите cookies и данные сайта для `outline.qt.local`.
5. Проверьте, что `OUTLINE_SECRET_KEY` не меняется между запусками.

### Сертификат не доверен

Повторите установку сертификата:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\configure-local-https.ps1 -ProjectDir $PWD -Phase Trust
```

После этого полностью перезапустите Firefox.

### Порт 80 или 443 занят

```powershell
Get-NetTCPConnection -LocalPort 80,443 -State Listen -ErrorAction SilentlyContinue
```

Остановите другой web-сервер или proxy. Open Server Panel для этой установки не нужен.

### Outline не запускается

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200 outline postgres redis
```

### Schedule не запускается

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200 schedule outline postgres
```

### HTTPS proxy не запускается

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200 proxy
```

### Письмо входа не появилось

Откройте `http://localhost:8025` и проверьте:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=100 mailpit outline
```

---

## 15. Важные правила

- запуск выполняется из `C:\OSPanel\home\schedule.qt.local`;
- Open Server Panel не используется;
- основной вход — только `https://outline.qt.local`;
- миграциями общей базы владеет Outline;
- `prisma migrate`, `prisma db push` и ручные миграции Schedule запускать нельзя;
- Schedule открывается через активную сессию Outline;
- `.env` и `.env.symbiosis` нельзя добавлять в Git;
- секреты нельзя менять при обычной пересборке;
- `docker compose down` сохраняет данные;
- `docker compose down -v` удаляет все данные установки.
