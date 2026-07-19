import crypto from "node:crypto";
import assert from "node:assert/strict";
import { verifyOutlineToken } from "../src/lib/outline-integration";

const secret = process.env.SCHEDULE_SSO_SECRET;
if (!secret) {
  throw new Error("SCHEDULE_SSO_SECRET is required for the SSO contract check");
}

const userId = "22222222-2222-4222-8222-222222222222";
const teamId = "11111111-1111-4111-8111-111111111111";

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    sub: userId,
    teamId,
    iss: "outline",
    aud: "schichtplaner",
    iat: now,
    exp: now + 60,
    jti: crypto.randomUUID(),
    ...overrides,
  });
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

const valid = verifyOutlineToken(createToken());
assert.equal(valid.sub, userId);
assert.equal(valid.teamId, teamId);
assert.equal(valid.iss, "outline");
assert.equal(valid.aud, "schichtplaner");
assert.equal(valid.exp - valid.iat, 60);

assert.throws(
  () => verifyOutlineToken(`${createToken()}tampered`),
  /Invalid Outline token signature/
);
assert.throws(
  () => verifyOutlineToken(createToken({ aud: "another-service" })),
  /Invalid Outline token claims/
);
assert.throws(
  () =>
    verifyOutlineToken(
      createToken({
        iat: Math.floor(Date.now() / 1000) - 120,
        exp: Math.floor(Date.now() / 1000) - 60,
      })
    ),
  /Expired or invalid Outline token lifetime/
);
assert.throws(
  () =>
    verifyOutlineToken(
      createToken({
        exp: Math.floor(Date.now() / 1000) + 600,
      })
    ),
  /Expired or invalid Outline token lifetime/
);

console.log("Outline -> Schedule SSO contract passed");
