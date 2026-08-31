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
  /** The exact URL the finding was observed on — the fingerprint anchor for correlation, the web-scan equivalent of a source finding's filePath+line. */
  url: string;
  evidence: WebFindingEvidence[];
  remediation: string;
}
