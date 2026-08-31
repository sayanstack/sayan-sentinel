import { computeFingerprint, type FindingDraft } from "@sayan-sentinel/findings";
import type { RuleFinding } from "../engine/types";

/**
 * Maps a `RuleFinding` into the shared `FindingDraft` shape so it can flow
 * through the same correlation/security-score/policy pipeline every other
 * detector (Semgrep, Gitleaks, OSV, AI review) uses. `primarySource` is
 * `"rules_engine"` — a distinct value from `"static_analysis"` — so the
 * correlation engine can tell "Sentinel's own rules engine" and "a generic
 * pattern-matching scanner" apart and escalate confidence when both agree on
 * the same underlying issue, rather than silently deduping them as the same
 * detector.
 */
export function ruleFindingToDraft(finding: RuleFinding): FindingDraft {
  const evidenceText = finding.trace.map((step) => step.snippet ?? step.description).join(" -> ");

  return {
    fingerprint: computeFingerprint({
      source: "rules_engine",
      category: finding.ruleId,
      filePath: finding.filePath,
      symbol: finding.symbol,
      evidenceText,
      lineStart: finding.lineStart,
    }),
    category: finding.ruleId,
    cwe: finding.cwe,
    owaspCategory: finding.owasp?.[0],
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    confidence: finding.confidence,
    primarySource: "rules_engine",
    filePath: finding.filePath,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    symbol: finding.symbol,
    remediation: finding.remediation,
    evidence: [
      {
        source: "rules_engine",
        scanner: "sentinel-rules-engine",
        detail: {
          ruleId: finding.ruleId,
          route: finding.route,
          reason: finding.reason,
          confidenceScore: finding.confidenceScore,
          evidence: finding.evidence,
          trace: finding.trace,
        },
      },
    ],
  };
}
