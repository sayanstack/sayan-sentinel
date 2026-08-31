import type { ConfidenceLevel, Severity } from "@sayan-sentinel/shared";

export interface WebFindingEvidence {
  label: string;
  detail: string;
}

export interface WebFinding {
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: ConfidenceLevel;
  reason: string;
  evidence: WebFindingEvidence[];
  remediation: string;
}
