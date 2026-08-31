import { computeFingerprint, type FindingDraft } from "@sayan-sentinel/findings";
import { maskSecretValue } from "@sayan-sentinel/shared";
import type { GitleaksFinding, GitleaksOutput } from "./types";

/**
 * Every discovered secret is masked before it ever leaves this function —
 * the raw `Secret`/`Match` values from gitleaks never reach the returned
 * FindingDraft, so they can't end up logged, rendered in the UI, or sent
 * to an AI provider (Sections 11/14/31).
 */
function toFindingDraft(finding: GitleaksFinding): FindingDraft {
  const fingerprint = computeFingerprint({
    source: "secret_detection",
    category: finding.RuleID,
    filePath: finding.File,
    // gitleaks' own fingerprint already anchors on file:rule:line; reuse
    // it when present so an unmoved secret keeps matching across scans.
    evidenceText: finding.Fingerprint,
    lineStart: finding.StartLine,
  });

  return {
    fingerprint,
    category: finding.RuleID,
    title: finding.Description || finding.RuleID,
    description: `Potential ${finding.Description || finding.RuleID} detected in ${finding.File}.`,
    severity: "critical",
    confidence: "medium",
    primarySource: "secret_detection",
    filePath: finding.File,
    lineStart: finding.StartLine,
    lineEnd: finding.EndLine,
    evidence: [
      {
        source: "secret_detection",
        scanner: "gitleaks",
        detail: {
          ruleId: finding.RuleID,
          maskedSecret: maskSecretValue(finding.Secret),
          maskedMatch: maskSecretValue(finding.Match),
          entropy: finding.Entropy,
          tags: finding.Tags,
        },
      },
    ],
  };
}

export function normalizeGitleaksOutput(output: GitleaksOutput): FindingDraft[] {
  return output.map(toFindingDraft);
}
