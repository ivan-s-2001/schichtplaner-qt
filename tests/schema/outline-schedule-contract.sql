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
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='schedule' AND t.typname='ScheduleMode') THEN
    CREATE TYPE schedule."ScheduleMode" AS ENUM ('SHIFT','STABLE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='schedule' AND t.typname='WorkIntervalKind') THEN
    CREATE TYPE schedule."WorkIntervalKind" AS ENUM ('WORK','BREAK');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='schedule' AND t.typname='TimeBalanceEntryKind') THEN
    CREATE TYPE schedule."TimeBalanceEntryKind" AS ENUM ('OVERTIME','SHORTENING','BALANCE_USE','ADMIN_LEAVE','MANUAL_ADJUSTMENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='schedule' AND t.typname='ApprovalState') THEN
    CREATE TYPE schedule."ApprovalState" AS ENUM ('PENDING','APPROVED','DECLINED');
  END IF;
END $$;

CREATE VIEW schedule.users AS
SELECT
  u."id",
  u."email",
  NULL::text AS "passwordHash",
  CASE
    WHEN array_length(regexp_split_to_array(trim(u."name"), '\s+'), 1) >= 2
      THEN (regexp_split_to_array(trim(u."name"), '\s+'))[2]
    ELSE trim(u."name")
  END AS "firstName",
  CASE
    WHEN array_length(regexp_split_to_array(trim(u."name"), '\s+'), 1) >= 2
      THEN (regexp_split_to_array(trim(u."name"), '\s+'))[1]
    ELSE ''
  END AS "lastName",
  CASE
    WHEN array_length(regexp_split_to_array(trim(u."name"), '\s+'), 1) >= 3
      THEN array_to_string((regexp_split_to_array(trim(u."name"), '\s+'))[3:], ' ')
    ELSE NULL
  END AS "patronymic",
  NULL::text AS "nickname",
  NULL::text AS "phone",
  u."avatarUrl" AS "profileImage",
  COALESCE(u."language", 'ru') AS "locale",
  u."createdAt" AS "emailVerified",
  u."createdAt",
  u."updatedAt"
FROM public.users u
WHERE u."deletedAt" IS NULL;

CREATE TABLE schedule.divisions (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES public.teams("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "isSystem" BOOLEAN NOT NULL DEFAULT FALSE,
  "scheduleMode" schedule."ScheduleMode" NOT NULL DEFAULT 'STABLE',
  "managerUserId" UUID REFERENCES public.users("id") ON DELETE SET NULL,
  "createdById" UUID REFERENCES public.users("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX schedule_divisions_team_title_active_key
  ON schedule.divisions("organizationId", LOWER("title"))
  WHERE "deletedAt" IS NULL;

CREATE TABLE schedule.division_members (
  "divisionId" UUID NOT NULL REFERENCES schedule.divisions("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
  "dailyTargetMinutes" INTEGER NOT NULL DEFAULT 480,
  "weeklyTargetMinutes" INTEGER NOT NULL DEFAULT 2400,
  "assignedById" UUID REFERENCES public.users("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY("divisionId", "userId"),
  UNIQUE("userId")
);

CREATE TABLE schedule.schedules (
  "id" TEXT PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES public.teams("id") ON DELETE CASCADE,
  "divisionId" UUID REFERENCES schedule.divisions("id") ON DELETE SET NULL,
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
  "divisionId" UUID REFERENCES schedule.divisions("id") ON DELETE SET NULL,
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

CREATE TABLE schedule.stable_work_days (
  "id" TEXT PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
  "dayOfWeek" INTEGER NOT NULL CHECK ("dayOfWeek" BETWEEN 1 AND 7),
  "isWorkingDay" BOOLEAN NOT NULL DEFAULT TRUE,
  "targetMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId", "dayOfWeek")
);

CREATE TABLE schedule.stable_work_intervals (
  "id" TEXT PRIMARY KEY,
  "workDayId" TEXT NOT NULL REFERENCES schedule.stable_work_days("id") ON DELETE CASCADE,
  "kind" schedule."WorkIntervalKind" NOT NULL DEFAULT 'WORK',
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CHECK ("endMinute">"startMinute")
);

CREATE TABLE schedule.time_balance_entries (
  "id" TEXT PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
  "divisionId" UUID NOT NULL REFERENCES schedule.divisions("id") ON DELETE CASCADE,
  "workDate" DATE NOT NULL,
  "kind" schedule."TimeBalanceEntryKind" NOT NULL,
  "minutes" INTEGER NOT NULL,
  "note" TEXT,
  "state" schedule."ApprovalState" NOT NULL DEFAULT 'PENDING',
  "createdById" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
  "approvedById" UUID REFERENCES public.users("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
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

INSERT INTO schedule.divisions(
  "id", "organizationId", "title", "scheduleMode", "managerUserId", "createdById"
) VALUES (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'Служба заботы',
  'SHIFT',
  '22222222-2222-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222'
);

INSERT INTO schedule.division_members(
  "divisionId", "userId", "dailyTargetMinutes", "weeklyTargetMinutes"
) VALUES (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  480,
  2400
);
