import { db } from "@/lib/db";

type OutlineWorkspaceUser = {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  language: string | null;
  role: string;
};

type OutlineWorkspaceGroup = {
  id: string;
  name: string;
  description: string | null;
};

type OutlineMembership = {
  outlineUserId: string;
  outlineGroupId: string;
};

type LinkRow = { id: string };

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Пользователь", lastName: "Outline" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function linkUser(scheduleUserId: string, outlineUserId: string) {
  await db.$executeRaw`
    DELETE FROM "outline_user_links"
    WHERE "outlineUserId" = CAST(${outlineUserId} AS uuid)
      AND "scheduleUserId" <> ${scheduleUserId}
  `;
  await db.$executeRaw`
    INSERT INTO "outline_user_links" (
      "scheduleUserId", "outlineUserId", "createdAt", "updatedAt"
    ) VALUES (
      ${scheduleUserId}, CAST(${outlineUserId} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("scheduleUserId") DO UPDATE SET
      "outlineUserId" = EXCLUDED."outlineUserId",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function linkGroup(scheduleDivisionId: string, outlineGroupId: string) {
  await db.$executeRaw`
    DELETE FROM "outline_group_links"
    WHERE "outlineGroupId" = CAST(${outlineGroupId} AS uuid)
      AND "scheduleDivisionId" <> ${scheduleDivisionId}
  `;
  await db.$executeRaw`
    INSERT INTO "outline_group_links" (
      "scheduleDivisionId", "outlineGroupId", "createdAt", "updatedAt"
    ) VALUES (
      ${scheduleDivisionId}, CAST(${outlineGroupId} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("scheduleDivisionId") DO UPDATE SET
      "outlineGroupId" = EXCLUDED."outlineGroupId",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

/** Synchronizes every active user, group, and membership in one workspace. */
export async function syncOutlineWorkspace(
  outlineTeamId: string,
  scheduleOrganizationId: string
): Promise<void> {
  const [outlineUsers, outlineGroups, outlineMemberships] = await Promise.all([
    db.$queryRaw<OutlineWorkspaceUser[]>`
      SELECT
        u."id"::text AS "id",
        u."email" AS "email",
        u."name" AS "name",
        u."avatarUrl" AS "avatarUrl",
        u."language" AS "language",
        u."role"::text AS "role"
      FROM public."users" u
      WHERE u."teamId" = CAST(${outlineTeamId} AS uuid)
        AND u."deletedAt" IS NULL
        AND u."suspendedAt" IS NULL
      ORDER BY u."createdAt" ASC
    `,
    db.$queryRaw<OutlineWorkspaceGroup[]>`
      SELECT
        g."id"::text AS "id",
        g."name" AS "name",
        g."description" AS "description"
      FROM public."groups" g
      WHERE g."teamId" = CAST(${outlineTeamId} AS uuid)
        AND g."deletedAt" IS NULL
      ORDER BY g."name" ASC
    `,
    db.$queryRaw<OutlineMembership[]>`
      SELECT
        gu."userId"::text AS "outlineUserId",
        gu."groupId"::text AS "outlineGroupId"
      FROM public."group_users" gu
      INNER JOIN public."users" u ON u."id" = gu."userId"
      INNER JOIN public."groups" g ON g."id" = gu."groupId"
      WHERE u."teamId" = CAST(${outlineTeamId} AS uuid)
        AND g."teamId" = CAST(${outlineTeamId} AS uuid)
        AND u."deletedAt" IS NULL
        AND u."suspendedAt" IS NULL
        AND g."deletedAt" IS NULL
    `,
  ]);

  const divisionByOutlineGroup = new Map<string, string>();

  for (const group of outlineGroups) {
    const links = await db.$queryRaw<LinkRow[]>`
      SELECT "scheduleDivisionId" AS "id"
      FROM "outline_group_links"
      WHERE "outlineGroupId" = CAST(${group.id} AS uuid)
      LIMIT 1
    `;

    let division = links[0]
      ? await db.division.findUnique({ where: { id: links[0].id } })
      : null;

    if (!division) {
      division = await db.division.findFirst({
        where: {
          organizationId: scheduleOrganizationId,
          title: { equals: group.name, mode: "insensitive" },
        },
      });
    }

    division = division
      ? await db.division.update({
          where: { id: division.id },
          data: {
            title: group.name,
            description: group.description,
            deletedAt: null,
          },
        })
      : await db.division.create({
          data: {
            organizationId: scheduleOrganizationId,
            title: group.name,
            description: group.description,
          },
        });

    await linkGroup(division.id, group.id);
    divisionByOutlineGroup.set(group.id, division.id);
  }

  const scheduleUserByOutlineUser = new Map<string, string>();
  const scheduleAdminIds: string[] = [];

  for (const outlineUser of outlineUsers) {
    const email =
      outlineUser.email?.trim().toLowerCase() ??
      `outline-${outlineUser.id}@outline.local`;
    const { firstName, lastName } = splitName(outlineUser.name);

    const links = await db.$queryRaw<LinkRow[]>`
      SELECT "scheduleUserId" AS "id"
      FROM "outline_user_links"
      WHERE "outlineUserId" = CAST(${outlineUser.id} AS uuid)
      LIMIT 1
    `;

    let scheduleUser = links[0]
      ? await db.user.findUnique({ where: { id: links[0].id } })
      : null;

    if (!scheduleUser) {
      scheduleUser = await db.user.findUnique({ where: { email } });
    }

    scheduleUser = scheduleUser
      ? await db.user.update({
          where: { id: scheduleUser.id },
          data: {
            email,
            firstName,
            lastName,
            profileImage: outlineUser.avatarUrl,
            locale: outlineUser.language ?? "ru",
            emailVerified: new Date(),
          },
        })
      : await db.user.create({
          data: {
            email,
            firstName,
            lastName,
            profileImage: outlineUser.avatarUrl,
            locale: outlineUser.language ?? "ru",
            emailVerified: new Date(),
          },
        });

    await linkUser(scheduleUser.id, outlineUser.id);

    const existingMembership = await db.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: scheduleOrganizationId,
          userId: scheduleUser.id,
        },
      },
      select: { role: true },
    });

    const role =
      outlineUser.role === "admin"
        ? existingMembership?.role === "OWNER"
          ? "OWNER"
          : "ADMIN"
        : "EMPLOYEE";

    await db.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: scheduleOrganizationId,
          userId: scheduleUser.id,
        },
      },
      update: {
        role,
        isActive: true,
        isActivated: true,
        activationToken: null,
      },
      create: {
        organizationId: scheduleOrganizationId,
        userId: scheduleUser.id,
        role,
        isActive: true,
        isActivated: true,
      },
    });

    if (outlineUser.role === "admin") scheduleAdminIds.push(scheduleUser.id);
    scheduleUserByOutlineUser.set(outlineUser.id, scheduleUser.id);
  }

  await db.$executeRaw`
    DELETE FROM "division_members" dm
    USING "outline_group_links" ogl,
          "outline_user_links" oul,
          "divisions" d
    WHERE dm."divisionId" = ogl."scheduleDivisionId"
      AND dm."userId" = oul."scheduleUserId"
      AND d."id" = dm."divisionId"
      AND d."organizationId" = ${scheduleOrganizationId}
      AND NOT EXISTS (
        SELECT 1
        FROM public."group_users" gu
        WHERE gu."userId" = oul."outlineUserId"
          AND gu."groupId" = ogl."outlineGroupId"
      )
  `;

  for (const membership of outlineMemberships) {
    const scheduleUserId = scheduleUserByOutlineUser.get(membership.outlineUserId);
    const scheduleDivisionId = divisionByOutlineGroup.get(
      membership.outlineGroupId
    );
    if (!scheduleUserId || !scheduleDivisionId) continue;

    await db.divisionMember.upsert({
      where: {
        divisionId_userId: {
          divisionId: scheduleDivisionId,
          userId: scheduleUserId,
        },
      },
      update: {},
      create: { divisionId: scheduleDivisionId, userId: scheduleUserId },
    });
  }

  await db.$executeRaw`
    UPDATE "organization_members" om
    SET "isActive" = false
    FROM "outline_user_links" oul
    WHERE om."userId" = oul."scheduleUserId"
      AND om."organizationId" = ${scheduleOrganizationId}
      AND NOT EXISTS (
        SELECT 1
        FROM public."users" u
        WHERE u."id" = oul."outlineUserId"
          AND u."teamId" = CAST(${outlineTeamId} AS uuid)
          AND u."deletedAt" IS NULL
          AND u."suspendedAt" IS NULL
      )
  `;

  await db.$executeRaw`
    UPDATE "divisions" d
    SET "deletedAt" = CURRENT_TIMESTAMP
    FROM "outline_group_links" ogl
    WHERE d."id" = ogl."scheduleDivisionId"
      AND d."organizationId" = ${scheduleOrganizationId}
      AND NOT EXISTS (
        SELECT 1
        FROM public."groups" g
        WHERE g."id" = ogl."outlineGroupId"
          AND g."teamId" = CAST(${outlineTeamId} AS uuid)
          AND g."deletedAt" IS NULL
      )
  `;

  const owner = await db.organizationMember.findFirst({
    where: {
      organizationId: scheduleOrganizationId,
      role: "OWNER",
      isActive: true,
    },
    select: { id: true },
  });

  if (!owner && scheduleAdminIds[0]) {
    await db.organizationMember.update({
      where: {
        organizationId_userId: {
          organizationId: scheduleOrganizationId,
          userId: scheduleAdminIds[0],
        },
      },
      data: { role: "OWNER" },
    });
  }
}
