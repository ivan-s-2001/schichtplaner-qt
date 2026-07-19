import { db } from "@/lib/db";

export type OutlineDivision = {
  id: string;
  title: string;
  description: string | null;
  color: string;
  outlineGroupId: string;
};

/**
 * Reads access directly from Outline on every request. This makes removal from
 * a group effective immediately, even while the Schichtplaner session remains
 * active. Outline admins may switch to every active group in their workspace.
 */
export async function getOutlineDivisions(
  scheduleUserId: string,
  scheduleOrganizationId: string
): Promise<OutlineDivision[]> {
  return db.$queryRaw<OutlineDivision[]>`
    SELECT DISTINCT
      d."id" AS "id",
      d."title" AS "title",
      d."description" AS "description",
      d."color" AS "color",
      ogl."outlineGroupId"::text AS "outlineGroupId"
    FROM "divisions" d
    INNER JOIN "outline_group_links" ogl
      ON ogl."scheduleDivisionId" = d."id"
    INNER JOIN "outline_team_links" otl
      ON otl."scheduleOrganizationId" = d."organizationId"
    INNER JOIN "outline_user_links" oul
      ON oul."scheduleUserId" = ${scheduleUserId}
    INNER JOIN public."users" u
      ON u."id" = oul."outlineUserId"
      AND u."teamId" = otl."outlineTeamId"
    INNER JOIN public."groups" g
      ON g."id" = ogl."outlineGroupId"
      AND g."teamId" = u."teamId"
    LEFT JOIN public."group_users" gu
      ON gu."groupId" = g."id"
      AND gu."userId" = u."id"
    WHERE d."organizationId" = ${scheduleOrganizationId}
      AND d."deletedAt" IS NULL
      AND u."deletedAt" IS NULL
      AND u."suspendedAt" IS NULL
      AND g."deletedAt" IS NULL
      AND (
        u."role"::text = 'admin'
        OR gu."userId" IS NOT NULL
      )
    ORDER BY d."title" ASC
  `;
}

export async function resolveOutlineDivision(
  scheduleUserId: string,
  scheduleOrganizationId: string,
  requestedDivisionId: string | null | undefined
): Promise<OutlineDivision | null> {
  const divisions = await getOutlineDivisions(
    scheduleUserId,
    scheduleOrganizationId
  );
  if (divisions.length === 0) return null;

  return (
    divisions.find((division) => division.id === requestedDivisionId) ??
    divisions[0]
  );
}
