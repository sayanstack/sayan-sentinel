import { computeFingerprint, type FindingDraft } from "@sayan-sentinel/findings";
import type { ConfidenceLevel, Severity } from "@sayan-sentinel/shared";
import type { SemgrepMetadata, SemgrepOutput, SemgrepResult } from "./types";

function mapSeverity(severity: string): Severity {
  switch (severity.toUpperCase()) {
    case "ERROR":
      return "high";
    case "WARNING":
      return "medium";
    case "INFO":
      return "low";
    default:
      return "medium";
  }
}

function mapConfidence(confidence: string | undefined): ConfidenceLevel {
  switch ((confidence ?? "").toUpperCase()) {
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    default:
      return "medium";
  }
}

function firstOrValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function toFindingDraft(result: SemgrepResult): FindingDraft {
  const metadata: SemgrepMetadata = result.extra.metadata ?? {};
  const cwe = firstOrValue(metadata.cwe);
  const owasp = firstOrValue(metadata.owasp);
  const evidenceText = result.extra.lines;

  const fingerprint = computeFingerprint({
    source: "static_analysis",
    category: result.check_id,
    filePath: result.path,
    evidenceText,
    lineStart: result.start.line,
  });

  return {
    fingerprint,
    category: result.check_id,
    cwe,
    owaspCategory: owasp,
    title: result.check_id.split(".").pop() ?? result.check_id,
    description: result.extra.message,
    severity: mapSeverity(result.extra.severity),
    confidence: mapConfidence(metadata.confidence),
    primarySource: "static_analysis",
    filePath: result.path,
    lineStart: result.start.line,
    lineEnd: result.end.line,
    evidence: [
      {
        source: "static_analysis",
        scanner: "semgrep",
        detail: {
          checkId: result.check_id,
          severity: result.extra.severity,
          references: metadata.references,
          matchedLines: evidenceText,
        },
      },
    ],
  };
}

export function normalizeSemgrepOutput(output: SemgrepOutput): FindingDraft[] {
  return output.results.map(toFindingDraft);
}
