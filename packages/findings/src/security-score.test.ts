import { describe, expect, it } from "vitest";
import { computeSecurityScore, type ScoredFindingInput } from "./security-score";

const NOW = new Date("2026-08-31T00:00:00Z");

function finding(overrides: Partial<ScoredFindingInput>): ScoredFindingInput {
  return {
    severity: "medium",
    confidence: "medium",
    status: "open",
    firstSeenAt: NOW,
    ...overrides,
  };
}

describe("computeSecurityScore", () => {
  it("returns a perfect 100 with no findings", () => {
    expect(computeSecurityScore([], NOW)).toEqual({ score: 100, openFindingCount: 0, breakdown: [] });
  });

  it("excludes resolved, false-positive, and accepted-risk findings entirely", () => {
    const result = computeSecurityScore(
      [
        finding({ severity: "critical", status: "resolved" }),
        finding({ severity: "critical", status: "false_positive" }),
        finding({ severity: "critical", status: "accepted_risk" }),
      ],
      NOW,
    );
    expect(result).toEqual({ score: 100, openFindingCount: 0, breakdown: [] });
  });

  it("counts open, confirmed, likely, and needs_review as open", () => {
    const result = computeSecurityScore(
      [
        finding({ status: "open" }),
        finding({ status: "confirmed" }),
        finding({ status: "likely" }),
        finding({ status: "needs_review" }),
      ],
      NOW,
    );
    expect(result.openFindingCount).toBe(4);
  });

  it("penalizes a critical finding more heavily than a low one at equal confidence/age", () => {
    const criticalScore = computeSecurityScore([finding({ severity: "critical", confidence: "confirmed" })], NOW);
    const lowScore = computeSecurityScore([finding({ severity: "low", confidence: "confirmed" })], NOW);
    expect(criticalScore.score).toBeLessThan(lowScore.score);
  });

  it("penalizes lower-confidence findings less than confirmed ones of the same severity", () => {
    const confirmed = computeSecurityScore([finding({ severity: "high", confidence: "confirmed" })], NOW);
    const low = computeSecurityScore([finding({ severity: "high", confidence: "low" })], NOW);
    expect(low.score).toBeGreaterThan(confirmed.score);
  });

  it("penalizes an older open finding more than a fresh one of the same severity", () => {
    const fresh = computeSecurityScore([finding({ severity: "high", firstSeenAt: NOW })], NOW);
    const oldDate = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
    const old = computeSecurityScore([finding({ severity: "high", firstSeenAt: oldDate })], NOW);
    expect(old.score).toBeLessThan(fresh.score);
  });

  it("penalizes a dynamically-confirmed finding more than an unverified one of the same severity", () => {
    const unverified = computeSecurityScore([finding({ severity: "high" })], NOW);
    const confirmed = computeSecurityScore(
      [finding({ severity: "high", validatedByDynamicTesting: true })],
      NOW,
    );
    expect(confirmed.score).toBeLessThan(unverified.score);
  });

  it("never goes below 0 even with an overwhelming number of critical findings", () => {
    const manyCriticals = Array.from({ length: 50 }, () =>
      finding({ severity: "critical", confidence: "confirmed", validatedByDynamicTesting: true }),
    );
    const result = computeSecurityScore(manyCriticals, NOW);
    expect(result.score).toBe(0);
  });

  it("is deterministic for identical input", () => {
    const findings = [finding({ severity: "high" }), finding({ severity: "low" })];
    expect(computeSecurityScore(findings, NOW).score).toBe(computeSecurityScore(findings, NOW).score);
  });

  it("groups the breakdown by severity with correct counts", () => {
    const result = computeSecurityScore(
      [finding({ severity: "high" }), finding({ severity: "high" }), finding({ severity: "low" })],
      NOW,
    );
    const high = result.breakdown.find((b) => b.severity === "high");
    const low = result.breakdown.find((b) => b.severity === "low");
    expect(high?.count).toBe(2);
    expect(low?.count).toBe(1);
  });
});
