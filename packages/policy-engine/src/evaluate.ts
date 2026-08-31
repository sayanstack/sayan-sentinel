import type { Severity } from "@sayan-sentinel/shared";
import type {
  PolicyEvaluationFindingInput,
  PolicyEvaluationInput,
  PolicyEvaluationResult,
  PolicyRule,
  PolicyViolation,
} from "./types";

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const OPEN_STATUSES: PolicyEvaluationFindingInput["status"][] = ["open", "confirmed", "likely", "needs_review"];

function isOpen(f: PolicyEvaluationFindingInput): boolean {
  return OPEN_STATUSES.includes(f.status);
}

function atOrAbove(severity: Severity, min: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[min];
}

/**
 * Evaluates a repository's enabled policy rules against one scan/PR's
 * findings (Section 28). Each rule is independent — evaluation always
 * checks every enabled rule and reports every violation, rather than
 * stopping at the first failure, so a policy-gate consumer can show the
 * complete picture at once.
 */
export function evaluatePolicy(rules: PolicyRule[], input: PolicyEvaluationInput): PolicyEvaluationResult {
  const violations: PolicyViolation[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const violation = evaluateRule(rule, input);
    if (violation) violations.push(violation);
  }

  return { passed: violations.length === 0, violations };
}

function evaluateRule(rule: PolicyRule, input: PolicyEvaluationInput): PolicyViolation | null {
  switch (rule.type) {
    case "fail_on_severity": {
      const offenders = input.findings.filter((f) => isOpen(f) && atOrAbove(f.severity, rule.minSeverity));
      if (offenders.length === 0) return null;
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        message: `${offenders.length} open finding(s) at or above ${rule.minSeverity} severity`,
        offendingFindingCount: offenders.length,
      };
    }

    case "fail_on_confirmed_severity": {
      const offenders = input.findings.filter((f) => f.status === "confirmed" && atOrAbove(f.severity, rule.minSeverity));
      if (offenders.length === 0) return null;
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        message: `${offenders.length} confirmed finding(s) at or above ${rule.minSeverity} severity`,
        offendingFindingCount: offenders.length,
      };
    }

    case "block_new_secrets": {
      const offenders = input.findings.filter((f) => f.isNew && isOpen(f) && f.primarySource === "secret_detection");
      if (offenders.length === 0) return null;
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        message: `${offenders.length} newly introduced secret(s) detected`,
        offendingFindingCount: offenders.length,
      };
    }

    case "block_dependency_vulnerabilities": {
      const offenders = input.findings.filter(
        (f) => isOpen(f) && f.primarySource === "dependency_analysis" && atOrAbove(f.severity, rule.minSeverity),
      );
      if (offenders.length === 0) return null;
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        message: `${offenders.length} dependency vulnerability(ies) at or above ${rule.minSeverity} severity`,
        offendingFindingCount: offenders.length,
      };
    }

    case "require_review_for_sensitive_changes": {
      if (!input.changeSensitivity) return null;
      const matched = input.changeSensitivity.classifications.filter((c) =>
        c.categories.some((cat) => rule.categories.includes(cat)),
      );
      if (matched.length === 0) return null;
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        message: `${matched.length} file(s) touch sensitive categories requiring review: ${rule.categories.join(", ")}`,
        offendingFindingCount: 0,
      };
    }
  }
}
