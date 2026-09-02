import * as crypto from "node:crypto";

export interface SessionPayload {
  userId: string;
  githubLogin: string;
  iat: number;
  exp: number;
}

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

/**
 * A stateless, HMAC-SHA256-signed session token — `<base64url payload>.<base64url signature>`,
 * deliberately not a JWT library dependency (this codebase avoids adding a
 * dependency where `node:crypto` already does the job). The payload is
 * plaintext-visible (base64url, not encrypted) so it must never carry
 * anything beyond a user id, their GitHub login, and timestamps.
 */
export function createSessionToken(
  payload: Pick<SessionPayload, "userId" | "githubLogin">,
  secret: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const now = Date.now();
  const full: SessionPayload = { ...payload, iat: now, exp: now + ttlMs };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/**
 * Verifies signature (via `timingSafeEqual`, not `===`, to avoid a timing
 * side-channel) and expiry. Returns `null` for anything wrong — malformed
 * shape, bad signature, expired, or a payload missing its expected fields —
 * never partial/best-effort trust.
 */
export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = sign(body, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.userId !== "string" || typeof payload.githubLogin !== "string") return null;
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;

  return payload;
}
