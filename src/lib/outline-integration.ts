import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const TOKEN_ISSUER = "outline";
const TOKEN_AUDIENCE = "schichtplaner";

export type OutlineTokenPayload = {
  sub: string;
  teamId: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti?: string;
};

type OutlineUserRow = {
  id: string;
  teamId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  language: string | null;
  role: string;
  teamName: string;
};

type OutlineGroupRow = {
  id: string;
  name: string;
  description: string | null;
};

type LinkRow = {
  id: string;
};

export type OutlineDivision = {
  id: string;
  title: string;
  description: string | null;
  color: string;
  outlineGroupId: string;
};

function decodeJsonPart<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

export function verifyOutlineToken(token: string): OutlineTokenPayload {
  const secret = process.env.SCHEDULE_SSO_SECRET;
  if (!secret) {
    throw new Error("SCHEDULE_SSO_SECRET is not configured");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid Outline token");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonPart<{ alg?: string; typ?: string }>(encodedHeader);
  if (header.alg !== "HS256") {
    throw new Error("Unsupported Outline token algorithm");
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = Buffer.from(encodedSignature, "base64url");

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error("Invalid Outline token signature");
  }

  const payload = decodeJsonPart<OutlineTokenPayload>(encodedPayload);
  const now = Math.floor(Date.now() / 1000);

  if (
    payload.iss !== TOKEN_ISSUER ||
    payload.aud !== TOKEN_AUDIENCE ||
    !payload.sub ||
    !payload.teamId ||
    !payload.exp ||
    payload.exp <= now
  ) {
    throw new Error("Expired or invalid Outline token");
  }

  return payload;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Пользователь", lastName: "Outline" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function loadOutlineUser(
  outlineUserId: string,
  outlineTeamId: string
): Promise<OutlineUserRow> {
  const rows = await db.$queryRaw<OutlineUserRow[]>`
    SELECT
      u."id"::text AS "id",
      u."teamId"::text AS "teamId",
      u."email" AS "email",
      u."name" AS "name",
      u."avatarUrl" AS "avatarUrl",
      u."language" AS "language",
      u."role"::text AS "role",
      t."name" AS "teamName"
    FROM public."users" u
    INNER JOIN public."teams" t ON t."id" = u."teamId"
    WHERE u."id" = CAST(${outlineUserId} AS uuid)
      AND u."teamId" = CAST(${outlineTeamId} AS uuid)
      AND u."deletedAt" IS NULL
      AND u."suspendedAt" IS NULL
      AND t."deletedAt" IS NULL
    LIMIT 1
  `;

  const user = rows[0];
  if (!user) {
    throw new Error("Outline user is unavailable");
  }
  return user;
}

async function loadOutlineGroups(user: OutlineUserRow): Promise<OutlineGroupRow[]> {
  if (user.role === "admin") {
    return db.$queryRaw<OutlineGroupRow[]>`
      SELECT
        g."id"::text AS "id",
        g."name" AS "name",
        g."description" AS "description"
      FROM public."groups" g
      WHERE g."teamId" = CAST(${user.teamId} AS uuid)
        AND g."deletedAt" IS NULL
      ORDER BY g."name" ASC
    `;
  }

  return db.$queryRaw<OutlineGroupRow[]>`
    SELECT
      g."id"::text AS "id",
      g."name" AS "name",
      g."description" AS "description"
    FROM public."groups" g
    INNER JOIN public."group_users" gu ON gu."groupId" = g."id"
    WHERE gu."userId" = CAST(${user.id} AS uuid)
      AND g."teamId" = CAST(${user.teamId} AS uuid)
      AND g."deletedAt" IS NULL
    ORDER BY g."name" ASC
  `;
}

async function linkUser(scheduleUserId: string, outlineUserId: string) {
  await db.$executeRaw`
    DELETE FROM "outline_user_links"
    WHERE "scheduleUserId" = ${scheduleUserId}
       OR "outlineUserId" = CAST(${outlineUserId} AS uuid)
  `;
  await db.$executeRaw`
    INSERT INTO "outline_user_links" (
      "scheduleUserId", "outlineUserId", "createdAt", "updatedAt"
    ) VALUES (
      ${scheduleUserId}, CAST(${outlineUserId} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;
}

async function linkTeam(scheduleOrganizationId: string, outlineTeamId: string) {
  await db.$executeRaw`
    DELETE FROM "outline_team_links"
    WHERE "scheduleOrganizationId" = ${scheduleOrganizationId}
       OR "outlineTeamId" = CAST(${outlineTeamId} AS uuid)
  `;
  await db.$executeRaw`
    INSERT INTO "outline_team_links" (
      "scheduleOrganizationId", "outlineTeamId", "createdAt", "updatedAt"
    ) VALUES (
      ${scheduleOrganizationId}, CAST(${outlineTeamId} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;
}

async function linkGroup(scheduleDivisionId: string, outlineGroupId: string) {
  await db.$executeRaw`
    DELETE FROM "outline_group_links"
    WHERE "scheduleDivisionId" = ${scheduleDivisionId}
       OR "outlineGroupId" = CAST(${outlineGroupId} AS uuid)
  `;
  await db.$executeRaw`
    INSERT INTO "outline_group_links" (
      "scheduleDivisionId", "outlineGroupId", "createdAt", "updatedAt"
    ) VALUES (
      ${scheduleDivisionId}, CAST(${outlineGroupId} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;
}

export async function syncOutlineUser(payload: OutlineTokenPayload) {
  const outlineUser = await loadOutlineUser(payload.sub, payload.teamId);
  const groups = await loadOutlineGroups(outlineUser);
  const { firstName, lastName } = splitName(outlineUser.name);
  const email =
    outlineUser.email?.trim().toLowerCase() ??
    `outline-${outlineUser.id}@outline.local`;

  const userLinks = await db.$queryRaw<LinkRow[]>`
    SELECT "scheduleUserId" AS "id"
    FROM "outline_user_links"
    WHERE "outlineUserId" = CAST(${outlineUser.id} AS uuid)
    LIMIT 1
  `;

  let scheduleUser = userLinks[0]
    ? await db.user.findUnique({ where: { id: userLinks[0].id } })
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

  const teamLinks = await db.$queryRaw<LinkRow[]>`
    SELECT "scheduleOrganizationId" AS "id"
    FROM "outline_team_links"
    WHERE "outlineTeamId" = CAST(${outlineUser.teamId} AS uuid)
    LIMIT 1
  `;

  let organization = teamLinks[0]
    ? await db.organization.findUnique({ where: { id: teamLinks[0].id } })
    : null;

  if (!organization) {
    organization = await db.organization.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  organization = organization
    ? await db.organization.update({
        where: { id: organization.id },
        data: { name: outlineUser.teamName },
      })
    : await db.organization.create({
        data: { name: outlineUser.teamName },
      });

  await linkTeam(organization.id, outlineUser.teamId);

  const membership = await db.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: scheduleUser.id,
      },
    },
    update: {
      role: outlineUser.role === "admin" ? "ADMIN" : "EMPLOYEE",
      isActive: true,
      isActivated: true,
      activationToken: null,
    },
    create: {
      organizationId: organization.id,
      userId: scheduleUser.id,
      role: outlineUser.role === "admin" ? "ADMIN" : "EMPLOYEE",
      isActive: true,
      isActivated: true,
    },
    include: { user: true, organization: true },
  });

  const divisionIds: string[] = [];

  for (const group of groups) {
    const groupLinks = await db.$queryRaw<LinkRow[]>`
      SELECT "scheduleDivisionId" AS "id"
      FROM "outline_group_links"
      WHERE "outlineGroupId" = CAST(${group.id} AS uuid)
      LIMIT 1
    `;

    let division = groupLinks[0]
      ? await db.division.findUnique({ where: { id: groupLinks[0].id } })
      : null;

    if (!division) {
      division = await db.division.findFirst({
        where: {
          organizationId: organization.id,
          title: { equals: group.name, mode: "insensitive" },
          deletedAt: null,
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
            organizationId: organization.id,
            title: group.name,
            description: group.description,
          },
        });

    await linkGroup(division.id, group.id);
    await db.divisionMember.upsert({
      where: {
        divisionId_userId: {
          divisionId: division.id,
          userId: scheduleUser.id,
        },
      },
      update: {},
      create: {
        divisionId: division.id,
        userId: scheduleUser.id,
      },
    });
    divisionIds.push(division.id);
  }

  await db.divisionMember.deleteMany({
    where: {
      userId: scheduleUser.id,
      division: { organizationId: organization.id },
      ...(divisionIds.length > 0
        ? { divisionId: { notIn: divisionIds } }
        : {}),
    },
  });

  return membership;
}

export async function getOutlineDivisions(
  scheduleUserId: string,
  organizationId: string
): Promise<OutlineDivision[]> {
  return db.$queryRaw<OutlineDivision[]>`
    SELECT
      d."id" AS "id",
      d."title" AS "title",
      d."description" AS "description",
      d."color" AS "color",
      ogl."outlineGroupId"::text AS "outlineGroupId"
    FROM "divisions" d
    INNER JOIN "division_members" dm ON dm."divisionId" = d."id"
    INNER JOIN "outline_group_links" ogl ON ogl."scheduleDivisionId" = d."id"
    WHERE dm."userId" = ${scheduleUserId}
      AND d."organizationId" = ${organizationId}
      AND d."deletedAt" IS NULL
    ORDER BY d."title" ASC
  `;
}

export async function resolveOutlineDivision(
  scheduleUserId: string,
  organizationId: string,
  requestedDivisionId: string | null | undefined
): Promise<OutlineDivision | null> {
  const divisions = await getOutlineDivisions(scheduleUserId, organizationId);
  if (divisions.length === 0) return null;

  return (
    divisions.find((division) => division.id === requestedDivisionId) ?? divisions[0]
  );
}
