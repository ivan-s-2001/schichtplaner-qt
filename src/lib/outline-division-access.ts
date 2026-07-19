import { db } from "@/lib/db";

export type OutlineDivision = {
  id: string;
  title: string;
  description: string | null;
  color: string;
  outlineGroupId: null;
  scheduleMode: "SHIFT" | "STABLE";
  managerUserId: string | null;
  isManager: boolean;
  isPrimary: boolean;
};

/**
 * Scheduling divisions are managed independently in Outline settings.
 * Outline groups remain document-access groups and do not affect scheduling.
 * Every active workspace user may view every division; the single assignment
 * in schedule.division_members only controls the initial/default division.
 */
export async function getOutlineDivisions(
  outlineUserId: string,
  outlineTeamId: string
): Promise<OutlineDivision[]> {
  return db.$queryRaw<OutlineDivision[]>`
    SELECT
      d."id"::text AS "id",
      d."title" AS "title",
      d."description" AS "description",
      d."color" AS "color",
      NULL::text AS "outlineGroupId",
      d."scheduleMode"::text AS "scheduleMode",
      d."managerUserId"::text AS "managerUserId",
      (d."managerUserId" = CAST(${outlineUserId} AS uuid)) AS "isManager",
      (dm."userId" IS NOT NULL) AS "isPrimary"
    FROM schedule."divisions" d
    LEFT JOIN schedule."division_members" dm
      ON dm."divisionId" = d."id"
      AND dm."userId" = CAST(${outlineUserId} AS uuid)
    WHERE d."organizationId" = CAST(${outlineTeamId} AS uuid)
      AND d."deletedAt" IS NULL
    ORDER BY (dm."userId" IS NOT NULL) DESC, d."title" ASC
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
    divisions.find((division) => division.isPrimary) ??
    divisions[0]
  );
}
