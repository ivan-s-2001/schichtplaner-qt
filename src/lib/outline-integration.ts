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

type LinkRow = {
  id: string;
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
  const header = decodeJsonPart<{ alg?: string }>(encodedHeader);
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

async function linkTeam(scheduleOrganizationId: string, outlineTeamId: string) {
  await db.$executeRaw`
    DELETE FROM "outline_team_links"
    WHERE "outlineTeamId" = CAST(${outlineTeamId} AS uuid)
      AND "scheduleOrganizationId" <> ${scheduleOrganizationId}
  `;
  await db.$executeRaw`
    INSERT INTO "outline_team_links" (
      "scheduleOrganizationId", "outlineTeamId", "createdAt", "updatedAt"
    ) VALUES (
      ${scheduleOrganizationId}, CAST(${outlineTeamId} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("scheduleOrganizationId") DO UPDATE SET
      "outlineTeamId" = EXCLUDED."outlineTeamId",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

export async function syncOutlineUser(payload: OutlineTokenPayload) {
  const outlineUser = await loadOutlineUser(payload.sub, payload.teamId);
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

  return db.organizationMember.upsert({
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
}
