export type Scheme = "http" | "https";
export type SafetyTier = 0 | 1 | 2 | 3;

export interface TargetAuthorizationRecord {
  id: string;
  scheme: Scheme;
  host: string;
  port: number;
  /** Empty array means "any path under this host/port is in scope." */
  allowedPathPrefixes: string[];
  maxTier: SafetyTier;
  expiresAt: Date;
  revokedAt?: Date | null;
  /** Must be set (verification completed) before the authorization can ever pass Scope Guard. */
  verifiedAt?: Date | null;
}

export type ScopeDecisionReason =
  | "ok"
  | "invalid_url"
  | "unsupported_scheme"
  | "blocked_hostname"
  | "no_matching_authorization"
  | "authorization_revoked"
  | "authorization_expired"
  | "authorization_not_verified"
  | "tier_exceeds_authorization"
  | "path_not_allowed"
  | "host_resolves_to_blocked_address";

export interface ScopeDecision {
  allowed: boolean;
  reason: ScopeDecisionReason;
  detail?: string;
  matchedAuthorizationId?: string;
  resolvedAddresses?: string[];
}
