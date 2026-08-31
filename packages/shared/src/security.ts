/**
 * Canonical severity/confidence/status vocabulary shared by the findings
 * model, the security score formula, and the policy engine. Keeping these
 * in one place means every consumer agrees on what "Critical" or
 * "Confirmed" means.
 */

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCE_LEVELS = ["confirmed", "high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const FINDING_STATUSES = [
  "open",
  "confirmed",
  "likely",
  "needs_review",
  "false_positive",
  "resolved",
  "accepted_risk",
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const FINDING_SOURCES = [
  "static_analysis",
  "secret_detection",
  "dependency_analysis",
  "code_intelligence",
  "ai_review",
  "dynamic_validation",
] as const;
export type FindingSource = (typeof FINDING_SOURCES)[number];

/**
 * Dynamic-validation safety tiers, per docs/scope-guard.md. Tier 2 requires
 * explicit administrator approval and is disabled by default; Tier 3
 * (destructive) is never implemented in this product.
 */
export const SAFETY_TIERS = [0, 1, 2, 3] as const;
export type SafetyTier = (typeof SAFETY_TIERS)[number];

export function isSeverity(value: string): value is Severity {
  return (SEVERITIES as readonly string[]).includes(value);
}

export function isFindingStatus(value: string): value is FindingStatus {
  return (FINDING_STATUSES as readonly string[]).includes(value);
}
