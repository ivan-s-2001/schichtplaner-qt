-- Links between Schichtplaner records and the authoritative Outline records.
-- Schichtplaner runs in the `schedule` PostgreSQL schema, while Outline uses `public`.

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

-- Prevents a copied SSO URL from being reused during its short validity window.
CREATE TABLE IF NOT EXISTS "outline_sso_tokens" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outline_sso_tokens_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX IF NOT EXISTS "outline_sso_tokens_expiresAt_idx"
    ON "outline_sso_tokens"("expiresAt");
