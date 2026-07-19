import { db } from "@/lib/db";

export type OutlineDivision = {
  id: string;
  title: string;
  description: string | null;
  color: string;
  outlineGroupId: string;
};

/**
 * Reads departments directly from Outline. The scheduling department ID is the
 * same UUID as public.groups.id; there is no copied division table.
 */
export async function getOutlineDivisions(
  outlineUserId: string,
  outlineTeamId: string
): Promise<OutlineDivision[]> {
  return db.$queryRaw<OutlineDivision[]>`
    SELECT DISTINCT
      g."id"::text AS "id",
      g."name" AS "title",
      g."description" AS "description",
      '#6366f1'::text AS "color",
      g."id"::text AS "outlineGroupId"
    FROM public."users" u
    INNER JOIN public."groups" g
      ON g."teamId" = u."teamId"
    LEFT JOIN public."group_users" gu
      ON gu."groupId" = g."id"
      AND gu."userId" = u."id"
    WHERE u."id" = CAST(${outlineUserId} AS uuid)
      AND u."teamId" = CAST(${outlineTeamId} AS uuid)
      AND u."deletedAt" IS NULL
      AND u."suspendedAt" IS NULL
      AND g."deletedAt" IS NULL
      AND (
        u."role"::text = 'admin'
        OR gu."userId" IS NOT NULL
      )
    ORDER BY g."name" ASC
  `;
}

export async function resolveOutlineDivision(
  outlineUserId: string,
  outlineTeamId: string,
  requestedDivisionId: string | null | undefined
): Promise<OutlineDivision | null> {
  const divisions = await getOutlineDivisions(outlineUserId, outlineTeamId);
  if (divisions.length === 0) return null;

  return (
    divisions.find((division) => division.id === requestedDivisionId) ??
    divisions[0]
  );
}
