import { describe, expect, it } from "vitest";
import type { CorrelatedFinding } from "@sayan-sentinel/findings";
import { buildCheckRunSummary } from "./build-check-run-summary";
import type { FullStackScanResult } from "../pipeline/full-stack-scan-types";

function finding(severity: CorrelatedFinding["severity"]): CorrelatedFinding {
  return {
    fingerprint: `fp-${severity}`,
    category: "SENTINEL-AUTHZ-001",
    title: "Finding",
    description: "desc",
    severity,
    confidence: "high",
    primarySource: "rules_engine",
    evidence: [{ source: "rules_engine", scanner: "sentinel-rules-engine", detail: {} }],
    detectedBy: ["rules_engine"],
  };
}

function baseResult(overrides: Partial<FullStackScanResult> = {}): FullStackScanResult {
  return {
    code: {
      commitSha: "abc123",
      graph: { nodes: [], edges: [] },
      scannerRuns: [],
      correlatedFindings: [],
      securityScore: { score: 100, breakdown: [], openFindingCount: 0 },
      policyResult: { passed: true, violations: [] },
      durationMs: 100,
    },
    correlatedFindings: [],
    securityScore: { score: 100, breakdown: [], openFindingCount: 0 },
    durationMs: 100,
    ...overrides,
  };
}

describe("buildCheckRunSummary", () => {
  it("reports success when policy passed, with the real security score in the title", () => {
    const params = buildCheckRunSummary("abc123", baseResult());
    expect(params.headSha).toBe("abc123");
    expect(params.conclusion).toBe("success");
    expect(params.title).toContain("Passed");
    expect(params.title).toContain("100/100");
  });

  it("reports failure when policy failed, listing the actual violation messages", () => {
    const result = baseResult({
      code: {
        commitSha: "abc123",
        graph: { nodes: [], edges: [] },
        scannerRuns: [],
        correlatedFindings: [finding("critical")],
        securityScore: { score: 40, breakdown: [], openFindingCount: 1 },
        policyResult: {
          passed: false,
          violations: [
            {
              ruleId: "fail-on-critical",
              ruleType: "fail_on_severity",
              message: "A critical finding was found",
              offendingFindingCount: 1,
            },
          ],
        },
        durationMs: 100,
      },
      correlatedFindings: [finding("critical")],
      securityScore: { score: 40, breakdown: [], openFindingCount: 1 },
    });

    const params = buildCheckRunSummary("abc123", result);
    expect(params.conclusion).toBe("failure");
    expect(params.title).toContain("Failed");
    expect(params.summary).toContain("A critical finding was found");
  });

  it("includes a severity breakdown table reflecting the actual findings", () => {
    const result = baseResult({
      correlatedFindings: [finding("critical"), finding("high"), finding("high")],
    });
    const params = buildCheckRunSummary("abc123", result);
    expect(params.summary).toContain("| critical | 1 |");
    expect(params.summary).toContain("| high | 2 |");
    expect(params.summary).toContain("| low | 0 |");
  });

  it("mentions web scan results only when a web target was actually scanned", () => {
    const withoutWeb = buildCheckRunSummary("abc123", baseResult());
    expect(withoutWeb.summary).not.toContain("Web Security:");

    const withWeb = buildCheckRunSummary(
      "abc123",
      baseResult({
        web: {
          crawl: {
            startUrl: "https://example.com/",
            pages: [
              {
                url: "https://example.com/",
                depth: 0,
                status: 200,
                links: [],
                scripts: [],
                forms: [],
              },
            ],
            visitedCount: 1,
            skippedExternal: [],
            truncated: false,
            errors: [],
          },
          findings: [],
        },
      }),
    );
    expect(withWeb.summary).toContain("Web Security: 1 page(s) crawled, 0 finding(s).");
  });
});
