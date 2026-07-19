CREATE SCHEMA IF NOT EXISTS "schedule";
SET search_path TO "schedule", "public";

-- Every weekly schedule belongs to one Outline-backed department.
ALTER TABLE "schedules"
    ADD COLUMN IF NOT EXISTS "divisionId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'schedules_divisionId_fkey'
          AND conrelid = 'schedule.schedules'::regclass
    ) THEN
        ALTER TABLE "schedules"
            ADD CONSTRAINT "schedules_divisionId_fkey"
            FOREIGN KEY ("divisionId") REFERENCES "divisions"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Preserve legacy data when shifts already identify a department.
UPDATE "schedules" AS schedule_row
SET "divisionId" = source."divisionId"
FROM (
    SELECT "scheduleId", MIN("divisionId") AS "divisionId"
    FROM "shifts"
    WHERE "divisionId" IS NOT NULL
    GROUP BY "scheduleId"
) AS source
WHERE schedule_row."id" = source."scheduleId"
  AND schedule_row."divisionId" IS NULL;

UPDATE "shifts" AS shift_row
SET "divisionId" = schedule_row."divisionId"
FROM "schedules" AS schedule_row
WHERE shift_row."scheduleId" = schedule_row."id"
  AND shift_row."divisionId" IS NULL
  AND schedule_row."divisionId" IS NOT NULL;

ALTER TABLE "schedules"
    DROP CONSTRAINT IF EXISTS "schedules_organizationId_weekNumber_year_branchId_key";

CREATE INDEX IF NOT EXISTS "schedules_organizationId_divisionId_year_weekNumber_idx"
    ON "schedules"("organizationId", "divisionId", "year", "weekNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "schedules_org_division_week_year_branch_key"
    ON "schedules"(
        "organizationId",
        COALESCE("divisionId", ''),
        "weekNumber",
        "year",
        COALESCE("branchId", '')
    );

-- Portal and AI are deliberately removed from Schichtplaner.
DROP TABLE IF EXISTS "message_recipients" CASCADE;
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "portal_files" CASCADE;
DROP TABLE IF EXISTS "portal_folders" CASCADE;
DROP TABLE IF EXISTS "topic_posts" CASCADE;
DROP TABLE IF EXISTS "topics" CASCADE;
DROP TABLE IF EXISTS "briefings" CASCADE;
DROP TABLE IF EXISTS "org_settings" CASCADE;

-- Links between Schichtplaner records and authoritative Outline records.
CREATE TABLE IF NOT EXISTS "outline_user_links" (
    "scheduleUserId" TEXT NOT NULL,
    "outlineUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outline_user_links_pkey" PRIMARY KEY ("scheduleUserId"),
    CONSTRAINT "outline_user_links_scheduleUserId_fkey"
        FOREIGN KEY ("scheduleUserId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "outline_user_links_outlineUserId_key"
    ON "outline_user_links"("outlineUserId");

CREATE TABLE IF NOT EXISTS "outline_team_links" (
    "scheduleOrganizationId" TEXT NOT NULL,
    "outlineTeamId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outline_team_links_pkey" PRIMARY KEY ("scheduleOrganizationId"),
    CONSTRAINT "outline_team_links_scheduleOrganizationId_fkey"
        FOREIGN KEY ("scheduleOrganizationId") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "outline_team_links_outlineTeamId_key"
    ON "outline_team_links"("outlineTeamId");

CREATE TABLE IF NOT EXISTS "outline_group_links" (
    "scheduleDivisionId" TEXT NOT NULL,
    "outlineGroupId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outline_group_links_pkey" PRIMARY KEY ("scheduleDivisionId"),
    CONSTRAINT "outline_group_links_scheduleDivisionId_fkey"
        FOREIGN KEY ("scheduleDivisionId") REFERENCES "divisions"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "outline_group_links_outlineGroupId_key"
    ON "outline_group_links"("outlineGroupId");

-- A copied SSO URL cannot be reused during its short validity window.
CREATE TABLE IF NOT EXISTS "outline_sso_tokens" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outline_sso_tokens_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX IF NOT EXISTS "outline_sso_tokens_expiresAt_idx"
    ON "outline_sso_tokens"("expiresAt");
