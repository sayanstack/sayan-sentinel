import type { PolicyRule } from "./types";

/** Section 28's exact example policies, as convenience constructors. */
export function failIfCriticalExists(id = "fail-on-critical"): PolicyRule {
  return { id, enabled: true, type: "fail_on_severity", minSeverity: "critical" };
}

export function failOnConfirmedHigh(id = "fail-on-confirmed-high"): PolicyRule {
  return { id, enabled: true, type: "fail_on_confirmed_severity", minSeverity: "high" };
}

export function blockNewSecrets(id = "block-new-secrets"): PolicyRule {
  return { id, enabled: true, type: "block_new_secrets" };
}

export function blockCriticalDependencyVulnerabilities(id = "block-critical-dependency-vulnerabilities"): PolicyRule {
  return { id, enabled: true, type: "block_dependency_vulnerabilities", minSeverity: "critical" };
}

export function requireReviewForAuthChanges(id = "require-review-for-auth-changes"): PolicyRule {
  return {
    id,
    enabled: true,
    type: "require_review_for_sensitive_changes",
    categories: ["auth_logic", "authorization_logic"],
  };
}

export const DEFAULT_POLICY_RULES: PolicyRule[] = [
  failIfCriticalExists(),
  failOnConfirmedHigh(),
  blockNewSecrets(),
  blockCriticalDependencyVulnerabilities(),
  requireReviewForAuthChanges(),
];
