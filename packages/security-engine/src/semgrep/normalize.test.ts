import { describe, expect, it } from "vitest";
import { normalizeSemgrepOutput } from "./normalize";
import type { SemgrepOutput } from "./types";

// Fixture shaped after Semgrep's documented JSON output
// (https://semgrep.dev/docs/semgrep-appsec-platform/json-and-sarif).
const fixture: SemgrepOutput = {
  version: "1.99.0",
  results: [
    {
      check_id: "javascript.express.security.audit.express-open-redirect.express-open-redirect",
      path: "src/routes.js",
      start: { line: 10, col: 5, offset: 120 },
      end: { line: 10, col: 45, offset: 160 },
      extra: {
        message: "Open redirect to a user-controlled URL.",
        severity: "ERROR",
        metadata: {
          cwe: ["CWE-601: URL Redirection to Untrusted Site ('Open Redirect')"],
          owasp: ["A01:2021 - Broken Access Control"],
          references: ["https://owasp.org/www-community/attacks/Open_redirect"],
          confidence: "HIGH",
        },
        lines: "res.redirect(req.query.url);",
      },
    },
    {
      check_id: "javascript.lang.best-practice.eqeqeq",
      path: "src/util.js",
      start: { line: 3, col: 1, offset: 20 },
      end: { line: 3, col: 15, offset: 34 },
      extra: {
        message: "Use === instead of ==.",
        severity: "INFO",
        lines: "if (a == b) {",
      },
    },
  ],
  errors: [],
};

describe("normalizeSemgrepOutput", () => {
  it("maps each result to a FindingDraft", () => {
    const drafts = normalizeSemgrepOutput(fixture);
    expect(drafts).toHaveLength(2);
  });

  it("maps ERROR severity to high and extracts the first CWE/OWASP entry", () => {
    const [redirect] = normalizeSemgrepOutput(fixture);
    expect(redirect?.severity).toBe("high");
    expect(redirect?.confidence).toBe("high");
    expect(redirect?.cwe).toBe("CWE-601: URL Redirection to Untrusted Site ('Open Redirect')");
    expect(redirect?.owaspCategory).toBe("A01:2021 - Broken Access Control");
    expect(redirect?.primarySource).toBe("static_analysis");
    expect(redirect?.filePath).toBe("src/routes.js");
    expect(redirect?.lineStart).toBe(10);
  });

  it("maps INFO severity to low and defaults confidence to medium when metadata is absent", () => {
    const [, eqeqeq] = normalizeSemgrepOutput(fixture);
    expect(eqeqeq?.severity).toBe("low");
    expect(eqeqeq?.confidence).toBe("medium");
    expect(eqeqeq?.cwe).toBeUndefined();
  });

  it("produces the same fingerprint for the same finding across two scans", () => {
    const first = normalizeSemgrepOutput(fixture);
    const second = normalizeSemgrepOutput(structuredClone(fixture));
    expect(first[0]?.fingerprint).toBe(second[0]?.fingerprint);
  });

  it("carries the matched source line into evidence for reviewer context", () => {
    const [redirect] = normalizeSemgrepOutput(fixture);
    expect(redirect?.evidence[0]?.detail.matchedLines).toBe("res.redirect(req.query.url);");
    expect(redirect?.evidence[0]?.scanner).toBe("semgrep");
  });
});
