CREATE SCHEMA IF NOT EXISTS schedule;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='schedule' AND t.typname='ScheduleLayout') THEN
    CREATE TYPE schedule."ScheduleLayout" AS ENUM ('LAYOUT_1','LAYOUT_2');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='schedule' AND t.typname='PauseOption') THEN
    CREATE TYPE schedule."PauseOption" AS ENUM ('PER_HOUR','PER_SHIFT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='schedule' AND t.typname='AbsenceStatus') THEN
    CREATE TYPE schedule."AbsenceStatus" AS ENUM ('PENDING','APPROVED','DECLINED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='schedule' AND t.typname='TimeRecordType') THEN
    CREATE TYPE schedule."TimeRecordType" AS ENUM ('MANUAL','WATCH','MANUAL_DURATION');
  END IF;
END $$;

CREATE VIEW schedule.users AS
SELECT
  u."id",
  u."email",
  NULL::text AS "passwordHash",
  split_part(u."name", ' ', 1) AS "firstName",
  CASE WHEN position(' ' in u."name") > 0
    THEN substring(u."name" from position(' ' in u."name") + 1)
    ELSE ''
  END AS "lastName",
  NULL::text AS "patronymic",
  NULL::text AS "nickname",
  NULL::text AS "phone",
  u."avatarUrl" AS "profileImage",
  COALESCE(u."language", 'ru') AS "locale",
  u."createdAt" AS "emailVerified",
  u."createdAt",
  u."updatedAt"
FROM public.users u
WHERE u."deletedAt" IS NULL;

CREATE VIEW schedule.divisions AS
SELECT
  g."id",
  g."teamId" AS "organizationId",
  g."name" AS "title",
  g."description",
  '#6366f1'::text AS "color",
  FALSE AS "isSystem",
  g."createdAt",
  g."deletedAt"
FROM public.groups g;

CREATE VIEW schedule.division_members AS
SELECT gu."groupId" AS "divisionId", gu."userId"
FROM public.group_users gu;

CREATE TABLE schedule.schedules (
  "id" TEXT PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES public.teams("id") ON DELETE CASCADE,
  "divisionId" UUID REFERENCES public.groups("id") ON DELETE SET NULL,
  "branchId" TEXT,
  "weekNumber" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT FALSE,
  "settingsLayout" schedule."ScheduleLayout" NOT NULL DEFAULT 'LAYOUT_1',
  "showTitle" BOOLEAN NOT NULL DEFAULT TRUE,
  "showPauses" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);

CREATE TABLE schedule.shifts (
  "id" TEXT PRIMARY KEY,
  "scheduleId" TEXT NOT NULL REFERENCES schedule.schedules("id") ON DELETE CASCADE,
  "divisionId" UUID REFERENCES public.groups("id") ON DELETE SET NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "shiftFrom" TEXT NOT NULL,
  "shiftTo" TEXT NOT NULL,
  "maxEmployees" INTEGER NOT NULL DEFAULT 1,
  "pauseOption" schedule."PauseOption" NOT NULL DEFAULT 'PER_HOUR',
  "pauseValue" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);

CREATE TABLE schedule.bookings (
  "id" TEXT PRIMARY KEY,
  "shiftId" TEXT NOT NULL REFERENCES schedule.shifts("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
  "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bookedBy" UUID REFERENCES public.users("id") ON DELETE SET NULL,
  "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "overtimeBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  "overtimeAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  UNIQUE("shiftId","userId")
);

CREATE TABLE schedule.absence_categories (
  "id" TEXT PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES public.teams("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "isPaid" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE schedule.absences (
  "id" TEXT PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
  "categoryId" TEXT NOT NULL REFERENCES schedule.absence_categories("id"),
  "dateFrom" DATE NOT NULL,
  "dateTo" DATE NOT NULL,
  "note" TEXT,
  "status" schedule."AbsenceStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schedule.time_records (
  "id" TEXT PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
  "date" DATE NOT NULL,
  "timeFrom" TEXT,
  "timeTo" TEXT,
  "durationHours" INTEGER,
  "durationMinutes" INTEGER,
  "type" schedule."TimeRecordType" NOT NULL,
  "categoryId" TEXT,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
