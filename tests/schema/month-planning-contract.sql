DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'schedule' AND t.typname = 'MonthPlanningStatus'
  ) THEN
    CREATE TYPE schedule."MonthPlanningStatus" AS ENUM (
      'COLLECTING_PREFERENCES','PLANNING','PUBLISHED','CLOSED'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'schedule' AND t.typname = 'MonthPreferenceKind'
  ) THEN
    CREATE TYPE schedule."MonthPreferenceKind" AS ENUM (
      'PREFERRED','UNAVAILABLE'
    );
  END IF;
END $$;

CREATE TABLE schedule.month_planning_periods (
  "id" TEXT PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES public.teams("id") ON DELETE CASCADE,
  "divisionId" UUID NOT NULL REFERENCES schedule.divisions("id") ON DELETE CASCADE,
  "year" INTEGER NOT NULL CHECK ("year" BETWEEN 2000 AND 2100),
  "month" INTEGER NOT NULL CHECK ("month" BETWEEN 1 AND 12),
  "status" schedule."MonthPlanningStatus" NOT NULL DEFAULT 'COLLECTING_PREFERENCES',
  "preferenceDeadline" TIMESTAMP(3),
  "createdById" UUID REFERENCES public.users("id") ON DELETE SET NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX month_planning_periods_division_month_key
  ON schedule.month_planning_periods("divisionId", "year", "month");

CREATE TABLE schedule.month_planning_preferences (
  "id" TEXT PRIMARY KEY,
  "periodId" TEXT NOT NULL REFERENCES schedule.month_planning_periods("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
  "comment" TEXT,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("periodId", "userId")
);

CREATE TABLE schedule.month_planning_preference_items (
  "id" TEXT PRIMARY KEY,
  "preferenceId" TEXT NOT NULL REFERENCES schedule.month_planning_preferences("id") ON DELETE CASCADE,
  "workDate" DATE NOT NULL,
  "kind" schedule."MonthPreferenceKind" NOT NULL,
  "shiftTemplateCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    ("kind" = 'PREFERRED' AND "shiftTemplateCode" IS NOT NULL)
    OR
    ("kind" = 'UNAVAILABLE' AND "shiftTemplateCode" IS NULL)
  )
);
CREATE UNIQUE INDEX month_preference_preferred_item_key
  ON schedule.month_planning_preference_items(
    "preferenceId", "workDate", "shiftTemplateCode"
  ) WHERE "kind" = 'PREFERRED';
CREATE UNIQUE INDEX month_preference_unavailable_item_key
  ON schedule.month_planning_preference_items("preferenceId", "workDate")
  WHERE "kind" = 'UNAVAILABLE';

CREATE TABLE schedule.month_planning_assignments (
  "id" TEXT PRIMARY KEY,
  "periodId" TEXT NOT NULL REFERENCES schedule.month_planning_periods("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public.users("id") ON DELETE CASCADE,
  "workDate" DATE NOT NULL,
  "shiftTemplateCode" TEXT NOT NULL,
  "createdById" UUID REFERENCES public.users("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("periodId", "userId", "workDate")
);
