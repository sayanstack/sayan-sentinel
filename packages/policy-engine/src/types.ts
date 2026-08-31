import type { SensitivityCategory } from "@sayan-sentinel/github";
import type {
  ConfidenceLevel,
  FindingSource,
  FindingStatus,
  Severity,
} from "@sayan-sentinel/shared";

export type PolicyRule =
  | { id: string; enabled: boolean; type: "fail_on_severity"; minSeverity: Severity }
  | { id: string; enabled: boolean; type: "fail_on_confirmed_severity"; minSeverity: Severity }
  | { id: string; enabled: boolean; type: "block_new_secrets" }
  | {
      id: string;
      enabled: boolean;
      type: "block_dependency_vulnerabilities";
      minSeverity: Severity;
    }
  | {
      id: string;
      enabled: boolean;
      type: "require_review_for_sensitive_changes";
      categories: SensitivityCategory[];
    };

export interface PolicyEvaluationFindingInput {
  severity: Severity;
  confidence: ConfidenceLevel;
  status: FindingStatus;
  primarySource: FindingSource;
  /** True if this finding was first observed in the scan/PR currently being evaluated. */
  isNew: boolean;
}

export interface ChangeSensitivityReportLike {
  hasSensitiveChanges: boolean;
  classifications: Array<{ categories: SensitivityCategory[] }>;
}

export interface PolicyEvaluationInput {
  findings: PolicyEvaluationFindingInput[];
  changeSensitivity?: ChangeSensitivityReportLike;
}

export interface PolicyViolation {
  ruleId: string;
  ruleType: PolicyRule["type"];
  message: string;
  offendingFindingCount: number;
}

export interface PolicyEvaluationResult {
  passed: boolean;
  violations: PolicyViolation[];
}
