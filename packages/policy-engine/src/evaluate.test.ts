import { describe, expect, it } from "vitest";
import {
  blockCriticalDependencyVulnerabilities,
  blockNewSecrets,
  DEFAULT_POLICY_RULES,
  failIfCriticalExists,
  failOnConfirmedHigh,
  requireReviewForAuthChanges,
} from "./default-policies";
import { evaluatePolicy } from "./evaluate";
import type { PolicyEvaluationFindingInput } from "./types";

function finding(overrides: Partial<PolicyEvaluationFindingInput>): PolicyEvaluationFindingInput {
  return {
    severity: "medium",
    confidence: "medium",
    status: "open",
    primarySource: "static_analysis",
    isNew: false,
    ...overrides,
  };
}

describe("evaluatePolicy", () => {
  it("passes when there are no findings and no rules fire", () => {
    const result = evaluatePolicy([failIfCriticalExists()], { findings: [] });
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("fails when an open critical finding exists (fail_on_severity)", () => {
    const result = evaluatePolicy([failIfCriticalExists()], {
      findings: [finding({ severity: "critical" })],
    });
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.ruleType).toBe("fail_on_severity");
  });

  it("ignores a resolved critical finding for fail_on_severity", () => {
    const result = evaluatePolicy([failIfCriticalExists()], {
      findings: [finding({ severity: "critical", status: "resolved" })],
    });
    expect(result.passed).toBe(true);
  });

  it("fail_on_confirmed_severity only counts confirmed status, not merely 'open'", () => {
    const openOnly = evaluatePolicy([failOnConfirmedHigh()], {
      findings: [finding({ severity: "high", status: "open" })],
    });
    expect(openOnly.passed).toBe(true);

    const confirmed = evaluatePolicy([failOnConfirmedHigh()], {
      findings: [finding({ severity: "high", status: "confirmed" })],
    });
    expect(confirmed.passed).toBe(false);
  });

  it("block_new_secrets only fires for isNew secret-detection findings", () => {
    const oldSecret = evaluatePolicy([blockNewSecrets()], {
      findings: [finding({ primarySource: "secret_detection", isNew: false })],
    });
    expect(oldSecret.passed).toBe(true);

    const newSecret = evaluatePolicy([blockNewSecrets()], {
      findings: [finding({ primarySource: "secret_detection", isNew: true })],
    });
    expect(newSecret.passed).toBe(false);

    const newButNotSecret = evaluatePolicy([blockNewSecrets()], {
      findings: [finding({ primarySource: "static_analysis", isNew: true })],
    });
    expect(newButNotSecret.passed).toBe(true);
  });

  it("block_dependency_vulnerabilities only fires for dependency_analysis findings at/above the threshold", () => {
    const lowSeverityDep = evaluatePolicy([blockCriticalDependencyVulnerabilities()], {
      findings: [finding({ primarySource: "dependency_analysis", severity: "medium" })],
    });
    expect(lowSeverityDep.passed).toBe(true);

    const criticalDep = evaluatePolicy([blockCriticalDependencyVulnerabilities()], {
      findings: [finding({ primarySource: "dependency_analysis", severity: "critical" })],
    });
    expect(criticalDep.passed).toBe(false);
  });

  it("require_review_for_sensitive_changes fires based on changeSensitivity, independent of findings", () => {
    const result = evaluatePolicy([requireReviewForAuthChanges()], {
      findings: [],
      changeSensitivity: {
        hasSensitiveChanges: true,
        classifications: [{ categories: ["auth_logic"] }],
      },
    });
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.ruleType).toBe("require_review_for_sensitive_changes");
  });

  it("does not fire require_review_for_sensitive_changes for unrelated categories", () => {
    const result = evaluatePolicy([requireReviewForAuthChanges()], {
      findings: [],
      changeSensitivity: {
        hasSensitiveChanges: true,
        classifications: [{ categories: ["ci_cd_configuration"] }],
      },
    });
    expect(result.passed).toBe(true);
  });

  it("skips a disabled rule entirely", () => {
    const rule = { ...failIfCriticalExists(), enabled: false };
    const result = evaluatePolicy([rule], { findings: [finding({ severity: "critical" })] });
    expect(result.passed).toBe(true);
  });

  it("reports every violated rule, not just the first", () => {
    const result = evaluatePolicy([failIfCriticalExists(), blockNewSecrets()], {
      findings: [
        finding({ severity: "critical" }),
        finding({ primarySource: "secret_detection", isNew: true }),
      ],
    });
    expect(result.violations).toHaveLength(2);
  });

  it("DEFAULT_POLICY_RULES matches Section 28's five example policies", () => {
    expect(DEFAULT_POLICY_RULES.map((r) => r.type)).toEqual([
      "fail_on_severity",
      "fail_on_confirmed_severity",
      "block_new_secrets",
      "block_dependency_vulnerabilities",
      "require_review_for_sensitive_changes",
    ]);
  });
});
