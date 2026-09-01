import type { TargetAuthorization } from "@sayan-sentinel/database";
import type { TargetAuthorizationRecord } from "@sayan-sentinel/security-core";

/**
 * The actual unblocking integration point: converts a persisted, verified
 * `TargetAuthorization` row into the `TargetAuthorizationRecord` shape
 * `evaluateScopeGuard` (and, through it, `SafeHttpClient` and the
 * remote dynamic-validation provider) expect. Every caller that wants
 * to run a real Scope-Guard-gated request against a real, persisted
 * target goes through this — there is no other place a DB row becomes a
 * Scope Guard input, so the mapping can't drift between call sites.
 */
export function toScopeGuardRecord(target: TargetAuthorization): TargetAuthorizationRecord {
  return {
    id: target.id,
    scheme: target.scheme as "http" | "https",
    host: target.host,
    port: target.port,
    allowedPathPrefixes: target.allowedPathPrefixes,
    maxTier: target.maxTier as 0 | 1 | 2 | 3,
    expiresAt: target.expiresAt,
    revokedAt: target.revokedAt,
    verifiedAt: target.verifiedAt,
  };
}
