import * as crypto from "node:crypto";

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * A signed, stateless CSRF token for the OAuth `state` parameter —
 * `<nonce>.<timestamp>.<signature>`. No server-side storage (no session,
 * no cookie) is needed to verify it later: GitHub echoes the exact string
 * back on the callback, and `verifyOAuthState` re-derives the signature
 * from the same secret. This avoids adding a cookie-parsing dependency
 * just for a single short-lived value that never needs to be read by the
 * browser.
 */
export function createOAuthState(secret: string): string {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const body = `${nonce}.${Date.now()}`;
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyOAuthState(
  state: string,
  secret: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, timestamp, signature] = parts;
  if (!nonce || !timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${nonce}.${timestamp}`)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;

  const ts = Number(timestamp);
  return Number.isFinite(ts) && Date.now() - ts <= maxAgeMs;
}
