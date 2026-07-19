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

1. Keep the working Outline configuration in `Outline-osp/.env`.
2. Do not change or copy its existing `SECRET_KEY` and `UTILS_SECRET`.
3. Run `docker-symbiosis-up.bat`.
4. The script builds, starts, waits for, and verifies the shared stack.
5. Sign in to Outline at `http://localhost:3000`.
6. Click **Расписание** in the Outline sidebar.

The batch file creates `.env.symbiosis` only for scheduling-specific secrets when it does not exist. It never regenerates the Outline encryption secrets.

Run `docker-symbiosis-check.bat` at any time to verify:

- both HTTP applications respond;
- the PostgreSQL database is named `outline`;
- schemas `public` and `schedule` exist in that same database.

## SSO flow

1. `/api/schedule.open` checks the current Outline session.
2. Outline issues an HS256 token valid for 60 seconds.
3. The browser is redirected to Schichtplaner.
4. Schichtplaner validates and consumes the token.
5. The same token identifier cannot be used a second time.
6. Schichtplaner reads the user, workspace, groups, and group memberships from `public`.
7. Local scheduling records and link records are synchronized in `schedule`.
8. A normal Schichtplaner session is created.

Passwords and Outline session cookies are not copied into Schichtplaner.

## Department switching

The department selector in the Schichtplaner top bar contains the current user's Outline groups.

Switching a department changes:

- the employee list;
- visible shifts;
- absences and days off shown in the weekly schedule;
- shift assignments and cell editing permissions;
- the department assigned to newly created shifts.

Outline administrators receive access to every active group in their workspace. Other users receive access only to groups in which they are members.

## Database URLs inside Docker

Outline:

```text
postgresql://outline:<password>@postgres:5432/outline
```

Schichtplaner migration URL:

```text
postgresql://outline:<password>@postgres:5432/outline?schema=schedule
```

At runtime Prisma removes the Prisma-specific `schema` query parameter before passing the URL to node-postgres and explicitly configures `PrismaPg` with the `schedule` schema.

## Existing data

The Compose stack preserves data in Docker volumes when stopped normally.

```powershell
docker-symbiosis-down.bat
```

This does not delete PostgreSQL data.

A previous standalone Outline or Schichtplaner database is not copied automatically into a new Docker volume. Back it up before switching. Existing Schichtplaner data may be restored into the `schedule` schema or recreated with the repository import scripts.

## Useful commands

```powershell
# One-click start, build, wait, and smoke check
docker-symbiosis-up.bat

# Re-run the smoke check
docker-symbiosis-check.bat

# View services
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml ps

# Follow logs
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml logs -f outline schedule

# Stop without deleting data
docker-symbiosis-down.bat

# Delete the shared database and all local Docker data
docker compose --env-file .env.symbiosis -f docker-compose.symbiosis.yml down -v
```

Do not use `down -v` unless the shared Outline and scheduling data may be deleted.
