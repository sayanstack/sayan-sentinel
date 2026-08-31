import { describe, expect, it } from "vitest";
import { webFindingToDraft } from "./mapper";
import type { WebFinding } from "../analysis/types";

function finding(overrides: Partial<WebFinding> = {}): WebFinding {
  return {
    ruleId: "SENTINEL-WEB-002",
    title: "Cookie Missing Secure Attribute",
    description: "desc",
    severity: "medium",
    confidence: "high",
    reason: "Detected: ...",
    url: "https://target.example.com/",
    evidence: [{ label: "Cookie name", detail: "session_id" }],
    remediation: "Add Secure.",
    ...overrides,
  };
}

describe("webFindingToDraft", () => {
  it("maps a WebFinding to the shared FindingDraft shape with primarySource web_security", () => {
    const draft = webFindingToDraft(finding());
    expect(draft.primarySource).toBe("web_security");
    expect(draft.category).toBe("SENTINEL-WEB-002");
    expect(draft.severity).toBe("medium");
    expect(draft.filePath).toBe("https://target.example.com/");
    expect(draft.evidence[0]?.source).toBe("web_security");
  });

  it("produces a stable fingerprint for identical findings", () => {
    const a = webFindingToDraft(finding());
    const b = webFindingToDraft(finding());
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("produces a different fingerprint for findings on different URLs", () => {
    const a = webFindingToDraft(finding({ url: "https://a.example.com/" }));
    const b = webFindingToDraft(finding({ url: "https://b.example.com/" }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});
