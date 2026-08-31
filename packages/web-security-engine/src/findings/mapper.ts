import { computeFingerprint, type FindingDraft } from "@sayan-sentinel/findings";
import type { WebFinding } from "../analysis/types";

/**
 * Maps a `WebFinding` into the shared `FindingDraft` shape so it flows
 * through the same correlation/security-score/policy pipeline every other
 * detector uses. `primarySource: "web_security"` is a distinct value from
 * both `"static_analysis"` and `"rules_engine"` so a runtime-observed fact
 * (a missing header, a reflecting CORS policy) is never confused with a
 * source-code-derived one during correlation — the two are independent
 * signals about the same underlying issue, and agreement between them
 * should escalate confidence, not get deduped as "the same detector."
 * There is no `filePath`/`lineStart` for a web finding — the URL is the
 * fingerprint anchor instead, the web-scan equivalent of a source
 * location.
 */
export function webFindingToDraft(finding: WebFinding): FindingDraft {
  const evidenceText = finding.evidence.map((e) => `${e.label}: ${e.detail}`).join(" | ");

  return {
    fingerprint: computeFingerprint({
      source: "web_security",
      category: finding.ruleId,
      filePath: finding.url,
      evidenceText,
    }),
    category: finding.ruleId,
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    confidence: finding.confidence,
    primarySource: "web_security",
    filePath: finding.url,
    remediation: finding.remediation,
    evidence: [
      {
        source: "web_security",
        scanner: "sentinel-web-security-engine",
        detail: {
          ruleId: finding.ruleId,
          url: finding.url,
          reason: finding.reason,
          evidence: finding.evidence,
        },
      },
    ],
  };
}
