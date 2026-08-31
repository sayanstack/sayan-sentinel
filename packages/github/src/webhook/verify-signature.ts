import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a GitHub webhook's `X-Hub-Signature-256` header (Section 6:
 * "Verify webhook signatures"). `payload` must be the exact raw request
 * body bytes/string GitHub signed — re-serializing a parsed JSON object
 * will not produce a matching signature, so this must run before any body
 * parsing that could alter whitespace/key order.
 *
 * Uses a constant-time comparison (`timingSafeEqual`) so response timing
 * can't leak how many leading bytes of the signature matched. Handles the
 * length mismatch case explicitly first, since `timingSafeEqual` throws
 * rather than returning false when buffer lengths differ.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signatureHeader: string | undefined | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signatureHeader, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
