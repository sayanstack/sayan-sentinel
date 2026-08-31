import type { RuleFinding } from "../engine/types";
import type { SentinelRule } from "../engine/types";

const SARIF_LEVEL: Record<RuleFinding["severity"], "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

/**
 * Converts findings into a SARIF 2.1.0 log, using the shipped rule set to
 * populate `runs[].tool.driver.rules` so every `ruleId` a result references
 * resolves to a real rule definition (name, description, help) rather than
 * a bare id — the part SARIF consumers (GitHub code scanning, IDE
 * extensions) actually render.
 */
export function toSarif(findings: RuleFinding[], rules: SentinelRule[]): object {
  const rulesById = new Map(rules.map((r) => [r.id, r]));
  const usedRuleIds = new Set(findings.map((f) => f.ruleId));

  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Sentinel Rules Engine",
            informationUri: "https://github.com/sayanstack/sayan-sentinel",
            rules: [...usedRuleIds].map((id) => {
              const rule = rulesById.get(id);
              return {
                id,
                name: rule?.title ?? id,
                shortDescription: { text: rule?.title ?? id },
                fullDescription: { text: rule?.description ?? "" },
                help: { text: rule?.remediation ?? "" },
                properties: {
                  category: rule?.category,
                  cwe: rule?.cwe,
                  owasp: rule?.owasp,
                },
              };
            }),
          },
        },
        results: findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: SARIF_LEVEL[finding.severity],
          message: { text: finding.reason },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.filePath },
                region: {
                  startLine: Math.max(1, finding.lineStart),
                  endLine: Math.max(1, finding.lineEnd),
                },
              },
            },
          ],
          properties: {
            confidence: finding.confidence,
            confidenceScore: finding.confidenceScore,
            route: finding.route,
          },
        })),
      },
    ],
  };
}
