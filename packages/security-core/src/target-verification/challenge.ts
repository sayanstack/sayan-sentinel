import { randomBytes } from "node:crypto";

/**
 * Generates the random per-verification-attempt token a domain owner must
 * publish (as a DNS TXT record or serve at the well-known HTTP path) to
 * prove control of a target before Sentinel will ever treat it as
 * authorized. 24 random bytes, hex-encoded — long enough that guessing it
 * is infeasible, short enough to be practical to paste into a DNS record.
 */
export function generateVerificationChallenge(): string {
  return randomBytes(24).toString("hex");
}
