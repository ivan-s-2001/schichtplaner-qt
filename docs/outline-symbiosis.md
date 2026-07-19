# Outline + Schichtplaner

## Result

Both applications run in one Docker Compose stack and use one PostgreSQL database named `outline`.

- Outline tables: PostgreSQL schema `public`
- Schichtplaner tables: PostgreSQL schema `schedule`
- Outline workspace: Schichtplaner organization
- Outline group: Schichtplaner division
- Outline group membership: division membership
- Outline user: linked Schichtplaner employee

The applications share the database server and database, but their migrations cannot overwrite each other's tables.

## Folder layout

The repositories must be next to each other:

```text
workspace/
├── Outline-osp/
└── schichtplaner-qt/
```

The Compose file is started from `schichtplaner-qt` and builds Outline from `../Outline-osp`.

## First start on Windows

1. Keep the working Outline authentication configuration in `Outline-osp/.env`.
2. Run `docker-symbiosis-up.bat`.
3. Open `http://localhost:3000`.
4. Sign in to Outline.
5. Click **Расписание** in the Outline sidebar.

The batch file creates `.env.symbiosis` with random local secrets when it does not exist.

## SSO flow

1. `/api/schedule.open` checks the current Outline session.
2. Outline issues an HS256 token valid for 60 seconds.
3. The browser is redirected to Schichtplaner.
4. Schichtplaner validates the token.
5. Schichtplaner reads the user, workspace, groups, and group memberships from `public`.
6. Local scheduling records and link records are synchronized in `schedule`.
7. A normal Schichtplaner session is created.

Passwords and Outline session cookies are not copied into Schichtplaner.

## Department switching

The department selector in the Schichtplaner top bar contains the current user's Outline groups.

Switching a department changes:

- the employee list;
- visible shifts;
- absences and days off shown in the weekly schedule;
- the department assigned to newly created shifts.

Outline administrators receive access to every active group in their workspace. Other users receive access only to groups in which they are members.

## Database URLs inside Docker

Outline:

```text
postgresql://outline:<password>@postgres:5432/outline
```

Schichtplaner:

```text
postgresql://outline:<password>@postgres:5432/outline?schema=schedule
```

Both URLs point to the same database. The `schema=schedule` parameter changes only Schichtplaner's PostgreSQL search path.

## Useful commands

```powershell
# Start and rebuild
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml up -d --build

# View services
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml ps

# Follow logs
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs -f outline schedule

# Stop without deleting data
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml down

# Delete the shared database and all local Docker data
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml down -v
```

Do not use `down -v` unless the shared Outline and scheduling data may be deleted.
