# Outline + Schedule

Единая локальная установка Outline и сервиса расписаний.

Оба приложения запускаются **только через Docker Compose**. Open Server Panel, локальные Node.js, PostgreSQL, Redis, npm, yarn и Prisma для запуска не требуются.

Каталог `C:\OSPanel\home` используется только как обычное место хранения проектов.

## Состав установки

Docker Compose запускает пять контейнеров:

- `outline` — база знаний и основной вход пользователей;
- `schedule` — графики подразделений;
- `postgres` — единая база данных `outline`;
- `redis` — служебное хранилище Outline и Schedule;
- `mailpit` — локальная почта для входа в Outline.

В PostgreSQL используются две схемы:

- `public` — данные Outline и пользователей;
- `schedule` — данные графиков, смен, подразделений и баланса времени.

Личные данные пользователей не копируются в схему `schedule`.

---

## 1. Требования

Установите и запустите:

- Git;
- Docker Desktop с поддержкой Docker Compose.

Проверка в PowerShell:

```powershell
git --version
docker version
docker compose version
```

Open Server Panel запускать не нужно.

---

## 2. Клонирование проектов

Все команды ниже выполняются в **PowerShell**.

Перейдите в каталог проектов:

```powershell
Set-Location C:\OSPanel\home
```

Клонируйте Outline строго в `outline.qt.local`:

```powershell
git clone https://github.com/ivan-s-2001/Outline-osp.git .\outline.qt.local
```

Клонируйте Schedule строго в `schedule.qt.local`:

```powershell
git clone https://github.com/ivan-s-2001/schichtplaner-qt.git .\schedule.qt.local
```

После клонирования структура должна быть такой:

```text
C:\OSPanel\home\
├── outline.qt.local\
│   ├── package.json
│   ├── Dockerfile.symbiosis
│   └── ...
└── schedule.qt.local\
    ├── docker-compose.symbiosis.yml
    ├── docker-symbiosis-up.bat
    ├── docker-symbiosis-check.bat
    ├── docker-symbiosis-down.bat
    └── ...
```

Папки должны находиться рядом. Переименовывать их нельзя, потому что Docker Compose использует относительный путь `..\outline.qt.local`.

---

## 3. Первый запуск

Перейдите в Schedule:

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
```

Запустите весь комплект:

```powershell
.\docker-symbiosis-up.bat
```

Скрипт автоматически:

1. создаст `C:\OSPanel\home\schedule.qt.local\.env.symbiosis`;
2. сгенерирует случайные пароли и секреты;
3. создаст `C:\OSPanel\home\outline.qt.local\.env`;
4. соберёт Docker-образы Outline и Schedule;
5. запустит PostgreSQL, Redis и Mailpit;
6. запустит миграции Outline;
7. создаст и обновит схему `schedule`;
8. запустит оба приложения;
9. проверит контейнеры, базу данных и HTTP-адреса;
10. откроет Outline в браузере.

Вручную выполнять следующие команды **не нужно**:

```text
npm install
yarn install
npm run dev
prisma migrate
prisma db push
sequelize db:migrate
```

Все зависимости устанавливаются внутри Docker-образов. Миграции запускает контейнер Outline.

---

## 4. Адреса сервисов

После успешного запуска:

| Сервис | Адрес |
|---|---|
| Outline | `http://localhost:3000` |
| Schedule | `http://localhost:41873` |
| Mailpit | `http://localhost:8025` |

Schedule следует открывать через пункт **«Расписание»** в боковом меню Outline. Прямой вход по email в Schedule отключён.

---

## 5. Первый вход в Outline

1. Откройте `http://localhost:3000`.
2. Введите свой email.
3. Откройте Mailpit: `http://localhost:8025`.
4. Откройте письмо от Outline.
5. Перейдите по ссылке входа из письма.
6. Завершите создание рабочего пространства Outline.

Mailpit не отправляет письма в интернет. Все письма остаются внутри локального Docker-контейнера и показываются в веб-интерфейсе Mailpit.

---

## 6. Первичная настройка расписания

После входа под администратором Outline:

1. откройте **Настройки**;
2. перейдите в **Подразделения**;
3. создайте подразделение;
4. выберите тип графика:
   - `SHIFT` — сменный график;
   - `STABLE` — стабильный личный график;
5. назначьте руководителя подразделения;
6. назначьте сотрудников;
7. при необходимости задайте дневную и недельную нормы часов;
8. откройте **Расписание** в боковом меню Outline.

У одного сотрудника может быть только одно основное подразделение.

---

## 7. Проверка установки

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
.\docker-symbiosis-check.bat
```

Проверка подтверждает:

- работу контейнеров;
- наличие схем `public` и `schedule`;
- представление `schedule.users` над пользователями Outline;
- независимую таблицу `schedule.divisions`;
- внешние ключи на `public.users` и `public.teams`;
- доступность Outline, Schedule и Mailpit.

Посмотреть состояние контейнеров вручную:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml ps
```

---

## 8. Просмотр журналов

Все журналы:

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs -f
```

Только Outline и Schedule:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs -f outline schedule
```

Последние 200 строк:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200 outline schedule postgres redis mailpit
```

Выход из режима просмотра журналов:

```text
Ctrl+C
```

Контейнеры при этом продолжат работать.

---

## 9. Остановка

Остановить контейнеры без удаления данных:

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
.\docker-symbiosis-down.bat
```

Команда сохраняет:

- базу PostgreSQL;
- документы и вложения Outline;
- данные Redis;
- настройки и расписания.

Для повторного запуска:

```powershell
.\docker-symbiosis-up.bat
```

---

## 10. Перезапуск сервисов

Перезапустить Outline и Schedule без пересборки:

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml restart outline schedule
```

Перезапустить весь комплект:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml restart
```

---

## 11. Обновление проектов

Сначала обновите Outline:

```powershell
Set-Location C:\OSPanel\home\outline.qt.local
git pull origin main
```

Затем обновите Schedule:

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
git pull origin main
```

Пересоберите и запустите контейнеры:

```powershell
.\docker-symbiosis-up.bat
```

Скрипт использует `docker compose up -d --build`, поэтому изменённые приложения будут пересобраны. Существующие Docker volumes и данные сохранятся.

---

## 12. Изменение портов

Порты находятся в файле:

```text
C:\OSPanel\home\schedule.qt.local\.env.symbiosis
```

Стандартные значения:

```env
OUTLINE_URL=http://localhost:3000
OUTLINE_PORT=3000

SCHEDULE_URL=http://localhost:41873
SCHEDULE_PORT=41873

MAILPIT_PORT=8025
```

При изменении порта Outline одновременно измените `OUTLINE_URL` и `OUTLINE_PORT`.

При изменении порта Schedule одновременно измените `SCHEDULE_URL` и `SCHEDULE_PORT`.

После изменения выполните:

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
.\docker-symbiosis-up.bat
```

---

## 13. Полный сброс

> Команда ниже безвозвратно удаляет базу, пользователей, документы, подразделения и расписания.

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml down -v --remove-orphans
```

Чтобы также создать новые секреты при следующем запуске:

```powershell
Remove-Item .\.env.symbiosis -Force
Remove-Item ..\outline.qt.local\.env -Force
.\docker-symbiosis-up.bat
```

Не удаляйте `.env` и `.env.symbiosis` при обычном обновлении или перезапуске.

---

## 14. Типовые ошибки

### Docker не найден

Проверьте, что Docker Desktop запущен:

```powershell
docker version
```

### Не найден Outline

Проверьте наличие файла:

```text
C:\OSPanel\home\outline.qt.local\package.json
```

Обе папки должны находиться непосредственно внутри `C:\OSPanel\home`.

### Порт занят

Пример проверки порта `3000`:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
```

Проверьте также порты `41873` и `8025` либо измените их в `.env.symbiosis`.

### Outline не запускается

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200 outline postgres redis
```

### Schedule не запускается

```powershell
Set-Location C:\OSPanel\home\schedule.qt.local
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=200 schedule outline postgres
```

### Письмо входа не появилось

Проверьте Mailpit:

```text
http://localhost:8025
```

И его журнал:

```powershell
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs --tail=100 mailpit outline
```

---

## 15. Важные правила

- запуск выполняется из `C:\OSPanel\home\schedule.qt.local`;
- Open Server Panel не используется;
- Outline и Schedule не запускаются отдельными командами Node.js;
- база создаётся только контейнером PostgreSQL;
- миграциями общей базы владеет Outline;
- `prisma migrate`, `prisma db push` и ручные SQL-миграции Schedule запускать нельзя;
- Schedule открывается через активную сессию Outline;
- `.env` и `.env.symbiosis` нельзя добавлять в Git;
- обычная команда `docker compose down` не удаляет данные;
- команда `docker compose down -v` удаляет все данные установки.
