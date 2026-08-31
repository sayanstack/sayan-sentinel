import { describe, expect, it } from "vitest";
import { computeFingerprint } from "./fingerprint";

const base = {
  source: "static_analysis" as const,
  category: "javascript.express.security.open-redirect",
  filePath: "src/routes.ts",
  evidenceText: "res.redirect(req.query.url)",
};

describe("computeFingerprint", () => {
  it("is deterministic for identical input", () => {
    expect(computeFingerprint(base)).toBe(computeFingerprint({ ...base }));
  });

  it("changes when the category (rule id) changes", () => {
    expect(computeFingerprint(base)).not.toBe(computeFingerprint({ ...base, category: "other-rule" }));
  });

  it("changes when the file path changes", () => {
    expect(computeFingerprint(base)).not.toBe(computeFingerprint({ ...base, filePath: "src/other.ts" }));
  });

  it("changes when the detection source changes, even with identical category/path/text", () => {
    expect(computeFingerprint(base)).not.toBe(
      computeFingerprint({ ...base, source: "ai_review" }),
    );
  });

  it("stays stable when only the line number drifts but the matched text is unchanged", () => {
    const scanOne = computeFingerprint({ ...base, lineStart: 42 });
    const scanTwo = computeFingerprint({ ...base, lineStart: 58 });
    expect(scanOne).toBe(scanTwo);
  });

  it("falls back to line number when no evidence text is available, and that fallback does change with the line", () => {
    const withoutText = { source: "dependency_analysis" as const, category: "GHSA-xxxx", filePath: "package.json" };
    const atLine10 = computeFingerprint({ ...withoutText, lineStart: 10 });
    const atLine20 = computeFingerprint({ ...withoutText, lineStart: 20 });
    expect(atLine10).not.toBe(atLine20);
  });

  it("produces a hex sha256 digest", () => {
    expect(computeFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});
