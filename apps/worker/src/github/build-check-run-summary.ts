import type { CheckRunParams } from "@sayan-sentinel/github";
import type { Severity } from "@sayan-sentinel/shared";
import type { FullStackScanResult } from "../pipeline/full-stack-scan-types";

const SEVERITY_ORDER: readonly Severity[] = ["critical", "high", "medium", "low", "info"];

/**
 * Formats a completed scan into the GitHub Check Run this repository has
 * always been able to create (`GitHubAppClient.createCheckRun`) but never
 * actually called from anywhere — a real gap, not a design choice. The
 * conclusion is `policyResult.passed` directly, never inferred from the
 * Security Score alone, so a repository's own configured policy rules
 * (not an arbitrary score threshold this function invents) decide
 * success/failure.
 */
export function buildCheckRunSummary(headSha: string, result: FullStackScanResult): CheckRunParams {
  const passed = result.code.policyResult.passed;
  const score = result.securityScore.score;
  const findings = result.correlatedFindings;

  const countsBySeverity = Object.fromEntries(
    SEVERITY_ORDER.map((severity) => [
      severity,
      findings.filter((f) => f.severity === severity).length,
    ]),
  ) as Record<Severity, number>;

  const lines: string[] = [
    `**Sentinel Security Score: ${score}/100**`,
    "",
    "| Severity | Count |",
    "|---|---|",
    ...SEVERITY_ORDER.map((severity) => `| ${severity} | ${countsBySeverity[severity]} |`),
    "",
    passed ? "✅ All configured policies passed." : "❌ One or more configured policies failed.",
  ];

  if (result.web) {
    lines.push(
      "",
      `Web Security: ${result.web.crawl.pages.length} page(s) crawled, ${result.web.findings.length} finding(s).`,
    );
  }

  if (!passed && result.code.policyResult.violations.length > 0) {
    lines.push("", "**Policy violations:**");
    for (const violation of result.code.policyResult.violations) {
      lines.push(`- ${violation.message}`);
    }
  }

  return {
    headSha,
    name: "Sentinel Security Scan",
    status: "completed",
    conclusion: passed ? "success" : "failure",
    title: passed ? `Passed — Security Score ${score}/100` : `Failed — Security Score ${score}/100`,
    summary: lines.join("\n"),
  };
}
