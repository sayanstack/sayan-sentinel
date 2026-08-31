import type { ConfidenceLevel, FindingSource, Severity } from "@sayan-sentinel/shared";

/**
 * A scanner-produced finding before it's been persisted or correlated —
 * no repositoryId/scanId/status yet, since those are assigned once a scan
 * run and repository context exist. `evidence` always has at least one
 * entry (the detector that produced this draft); the correlation engine
 * merges evidence arrays together when multiple detectors agree.
 */
export interface FindingDraft {
  fingerprint: string;
  category: string;
  cwe?: string;
  owaspCategory?: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: ConfidenceLevel;
  primarySource: FindingSource;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  symbol?: string;
  remediation?: string;
  evidence: FindingEvidenceDraft[];
}

export interface FindingEvidenceDraft {
  source: FindingSource;
  scanner: string;
  /**
   * Structured detail for this piece of evidence. Never put a raw secret
   * value, credential, or token here — mask it first (see
   * `maskSecretValue` in @sayan-sentinel/shared). This object may end up
   * logged, shown in the UI, or included in an AI prompt.
   */
  detail: Record<string, unknown>;
}
