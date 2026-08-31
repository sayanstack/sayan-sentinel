import { describe, expect, it } from "vitest";
import { correlateFindings } from "./correlation";
import type { FindingDraft } from "./finding";

function draft(overrides: Partial<FindingDraft>): FindingDraft {
  return {
    fingerprint: "irrelevant-for-correlation-input",
    category: "sql-injection",
    title: "SQL Injection",
    description: "desc",
    severity: "high",
    confidence: "medium",
    primarySource: "static_analysis",
    filePath: "src/db.ts",
    lineStart: 10,
    lineEnd: 10,
    evidence: [{ source: "static_analysis", scanner: "semgrep", detail: {} }],
    ...overrides,
  };
}

describe("correlateFindings", () => {
  it("leaves a single, unrelated finding alone", () => {
    const result = correlateFindings([draft({})]);
    expect(result).toHaveLength(1);
    expect(result[0]?.detectedBy).toEqual(["static_analysis"]);
  });

  it("merges two findings from different detectors on the same file and overlapping lines", () => {
    const staticFinding = draft({
      primarySource: "static_analysis",
      lineStart: 10,
      lineEnd: 10,
      evidence: [{ source: "static_analysis", scanner: "semgrep", detail: {} }],
    });
    const aiFinding = draft({
      primarySource: "ai_review",
      lineStart: 11,
      lineEnd: 11,
      confidence: "high",
      evidence: [{ source: "ai_review", scanner: "sentinel-ai", detail: {} }],
    });

    const result = correlateFindings([staticFinding, aiFinding]);

    expect(result).toHaveLength(1);
    expect(result[0]?.detectedBy.sort()).toEqual(["ai_review", "static_analysis"]);
    expect(result[0]?.evidence).toHaveLength(2);
  });

  it("does not merge findings on the same file when lines are far apart", () => {
    const a = draft({ lineStart: 10, lineEnd: 10 });
    const b = draft({ lineStart: 500, lineEnd: 500, primarySource: "ai_review" });

    const result = correlateFindings([a, b]);
    expect(result).toHaveLength(2);
  });

  it("does not merge unrelated findings in different files", () => {
    const a = draft({ filePath: "src/a.ts", lineStart: 10 });
    const b = draft({ filePath: "src/b.ts", lineStart: 10 });

    const result = correlateFindings([a, b]);
    expect(result).toHaveLength(2);
  });

  it("escalates confidence by one level when two distinct sources agree", () => {
    const a = draft({ primarySource: "static_analysis", confidence: "medium", lineStart: 10 });
    const b = draft({ primarySource: "dynamic_validation", confidence: "medium", lineStart: 10 });

    const [merged] = correlateFindings([a, b]);
    expect(merged?.confidence).toBe("high");
  });

  it("caps escalated confidence at 'confirmed' rather than overflowing", () => {
    const a = draft({ primarySource: "static_analysis", confidence: "confirmed", lineStart: 10 });
    const b = draft({
      primarySource: "dynamic_validation",
      confidence: "confirmed",
      lineStart: 10,
    });

    const [merged] = correlateFindings([a, b]);
    expect(merged?.confidence).toBe("confirmed");
  });

  it("does not escalate confidence for two detections from the same single source", () => {
    const a = draft({ primarySource: "static_analysis", confidence: "medium", lineStart: 10 });
    const b = draft({ primarySource: "static_analysis", confidence: "medium", lineStart: 10 });

    const [merged] = correlateFindings([a, b]);
    expect(merged?.confidence).toBe("medium");
    expect(merged?.detectedBy).toEqual(["static_analysis"]);
  });

  it("takes the highest severity across the merged group", () => {
    const a = draft({ severity: "medium", lineStart: 10 });
    const b = draft({ severity: "critical", primarySource: "dynamic_validation", lineStart: 10 });

    const [merged] = correlateFindings([a, b]);
    expect(merged?.severity).toBe("critical");
  });

  it("prefers a dynamic_validation representative's title/description over static_analysis", () => {
    const a = draft({ primarySource: "static_analysis", title: "Static title", lineStart: 10 });
    const b = draft({
      primarySource: "dynamic_validation",
      title: "Dynamically confirmed exploit",
      lineStart: 10,
    });

    const [merged] = correlateFindings([a, b]);
    expect(merged?.title).toBe("Dynamically confirmed exploit");
  });

  it("correlates non-file-anchored dependency findings by matching category and symbol", () => {
    const a = draft({
      filePath: undefined,
      lineStart: undefined,
      lineEnd: undefined,
      category: "GHSA-xxxx",
      symbol: "lodash@4.17.15",
      primarySource: "dependency_analysis",
    });
    const b = draft({
      filePath: undefined,
      lineStart: undefined,
      lineEnd: undefined,
      category: "GHSA-xxxx",
      symbol: "lodash@4.17.15",
      primarySource: "ai_review",
    });

    const result = correlateFindings([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]?.detectedBy.sort()).toEqual(["ai_review", "dependency_analysis"]);
  });

  it("produces a stable correlation fingerprint independent of which source is present", () => {
    const withStaticFirst = correlateFindings([
      draft({ primarySource: "static_analysis", lineStart: 10 }),
      draft({ primarySource: "dynamic_validation", lineStart: 10 }),
    ]);
    const withOnlyStatic = correlateFindings([
      draft({ primarySource: "static_analysis", lineStart: 10 }),
    ]);

    // Both anchor on the same file/category/line, so the correlation
    // fingerprint should match even though the detector set differs —
    // this is what lets a finding "gain" a detector across scans without
    // being recreated as a new Finding.
    expect(withStaticFirst[0]?.fingerprint).toBe(withOnlyStatic[0]?.fingerprint);
  });
});
