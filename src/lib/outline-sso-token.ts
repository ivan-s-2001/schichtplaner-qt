import { db } from "@/lib/db";
import type { OutlineTokenPayload } from "@/lib/outline-integration";

type ConsumedTokenRow = {
  jti: string;
};

/**
 * Marks an Outline SSO token as consumed. The primary key makes concurrent
 * replays deterministic: exactly one request can insert the token identifier.
 */
export async function consumeOutlineSsoToken(
  payload: OutlineTokenPayload
): Promise<void> {
  if (!payload.jti) {
    throw new Error("Outline token has no identifier");
  }

  await db.$executeRaw`
    DELETE FROM "outline_sso_tokens"
    WHERE "expiresAt" < CURRENT_TIMESTAMP
  `;

  const consumed = await db.$queryRaw<ConsumedTokenRow[]>`
    INSERT INTO "outline_sso_tokens" ("jti", "expiresAt", "consumedAt")
    VALUES (
      ${payload.jti},
      ${new Date(payload.exp * 1000)},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("jti") DO NOTHING
    RETURNING "jti"
  `;

  if (consumed.length !== 1) {
    throw new Error("Outline token has already been used");
  }
}
