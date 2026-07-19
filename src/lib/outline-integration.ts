import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const TOKEN_ISSUER = "outline";
const TOKEN_AUDIENCE = "schichtplaner";
const MAX_TOKEN_LIFETIME_SECONDS = 5 * 60;
const CLOCK_SKEW_SECONDS = 30;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OutlineTokenPayload = {
  sub: string;
  teamId: string;
  iss: string;
  aud: string;
  iat: number;
  nbf?: number;
  exp: number;
  jti: string;
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

function getSsoSecret(): string {
  const secret = process.env.SCHEDULE_SSO_SECRET;
  if (!secret) {
    throw new Error("SCHEDULE_SSO_SECRET is not configured");
  }
  return secret;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function verifyOutlineToken(token: string): OutlineTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("Invalid Outline token");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonPart<{ alg?: unknown; typ?: unknown }>(encodedHeader);

  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("Unsupported Outline token header");
  }

  const expectedSignature = createHmac("sha256", getSsoSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = Buffer.from(encodedSignature, "base64url");

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error("Invalid Outline token signature");
  }

  const payload = decodeJsonPart<Partial<OutlineTokenPayload>>(encodedPayload);
  const now = Math.floor(Date.now() / 1000);

  if (
    payload.iss !== TOKEN_ISSUER ||
    payload.aud !== TOKEN_AUDIENCE ||
    typeof payload.sub !== "string" ||
    !UUID_PATTERN.test(payload.sub) ||
    typeof payload.teamId !== "string" ||
    !UUID_PATTERN.test(payload.teamId) ||
    typeof payload.jti !== "string" ||
    payload.jti.length < 16 ||
    !isInteger(payload.iat) ||
    !isInteger(payload.exp)
  ) {
    throw new Error("Invalid Outline token claims");
  }

  if (
    payload.iat > now + CLOCK_SKEW_SECONDS ||
    payload.exp <= now ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > MAX_TOKEN_LIFETIME_SECONDS
  ) {
    throw new Error("Expired or invalid Outline token lifetime");
  }

  if (
    payload.nbf !== undefined &&
    (!isInteger(payload.nbf) || payload.nbf > now + CLOCK_SKEW_SECONDS)
  ) {
    throw new Error("Outline token is not active yet");
  }

  return payload as OutlineTokenPayload;
}

export async function loadOutlineUserById(
  userId: string,
  teamId: string
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
    WHERE u."id" = CAST(${userId} AS uuid)
      AND u."teamId" = CAST(${teamId} AS uuid)
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

export async function loadOutlineSessionUser(
  payload: OutlineTokenPayload
): Promise<OutlineSessionUser> {
  return loadOutlineUserById(payload.sub, payload.teamId);
}
