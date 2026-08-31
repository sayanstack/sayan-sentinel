import { describe, expect, it } from "vitest";
import { normalizeGitleaksOutput } from "./normalize";
import type { GitleaksOutput } from "./types";

// Fixture shaped after gitleaks' documented JSON report fields
// (RuleID, Description, StartLine/EndLine, Match, Secret, File, Fingerprint, ...).
const fixture: GitleaksOutput = [
  {
    RuleID: "aws-access-token",
    Description: "AWS Access Token",
    StartLine: 12,
    EndLine: 12,
    StartColumn: 15,
    EndColumn: 35,
    Line: 'const key = "AKIAIOSFODNN7EXAMPLE";',
    Match: "AKIAIOSFODNN7EXAMPLE",
    Secret: "AKIAIOSFODNN7EXAMPLE",
    File: "config/settings.js",
    Commit: "",
    Author: "",
    Email: "",
    Date: "",
    Entropy: 3.9,
    Tags: ["key", "AWS"],
    Fingerprint: "config/settings.js:aws-access-token:12",
  },
];

describe("normalizeGitleaksOutput", () => {
  it("maps each finding to a FindingDraft with critical severity", () => {
    const [draft] = normalizeGitleaksOutput(fixture);
    expect(draft?.severity).toBe("critical");
    expect(draft?.primarySource).toBe("secret_detection");
    expect(draft?.category).toBe("aws-access-token");
    expect(draft?.filePath).toBe("config/settings.js");
    expect(draft?.lineStart).toBe(12);
  });

  it("never includes the raw secret value anywhere in the draft", () => {
    const [draft] = normalizeGitleaksOutput(fixture);
    const serialized = JSON.stringify(draft);
    expect(serialized).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("masks the secret and match in evidence rather than omitting them entirely", () => {
    const [draft] = normalizeGitleaksOutput(fixture);
    const detail = draft?.evidence[0]?.detail as { maskedSecret: string; maskedMatch: string };
    expect(detail.maskedSecret).toMatch(/^AKI\*+PLE$/);
    expect(detail.maskedMatch).toMatch(/^AKI\*+PLE$/);
  });

  it("reuses gitleaks' own fingerprint as the stability anchor so rescans match", () => {
    const first = normalizeGitleaksOutput(fixture);
    const second = normalizeGitleaksOutput(structuredClone(fixture));
    expect(first[0]?.fingerprint).toBe(second[0]?.fingerprint);
  });
});
