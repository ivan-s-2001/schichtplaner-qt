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

export type OutlineSessionUser = {
  id: string;
  teamId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  language: string | null;
  role: string;
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

export async function loadOutlineSessionUser(
  payload: OutlineTokenPayload
): Promise<OutlineSessionUser> {
  const rows = await db.$queryRaw<OutlineSessionUser[]>`
    SELECT
      u."id"::text AS "id",
      u."teamId"::text AS "teamId",
      u."email" AS "email",
      u."name" AS "name",
      u."avatarUrl" AS "avatarUrl",
      u."language" AS "language",
      u."role"::text AS "role"
    FROM public."users" u
    WHERE u."id" = CAST(${payload.sub} AS uuid)
      AND u."teamId" = CAST(${payload.teamId} AS uuid)
      AND u."deletedAt" IS NULL
      AND u."suspendedAt" IS NULL
    LIMIT 1
  `;

  const user = rows[0];
  if (!user) {
    throw new Error("Outline user is unavailable");
  }

  return user;
}
