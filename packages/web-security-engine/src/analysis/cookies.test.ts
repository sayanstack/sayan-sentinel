import { describe, expect, it } from "vitest";
import { analyzeCookies } from "./cookies";
import type { SafeHttpResponse } from "../http/types";

function response(
  setCookieHeaders: string[],
  url = "https://target.example.com/",
): SafeHttpResponse {
  return {
    url,
    status: 200,
    headers: {},
    setCookieHeaders,
    body: "",
    truncated: false,
    redirectChain: [],
  };
}

describe("analyzeCookies", () => {
  it("flags a session cookie missing Secure at medium severity on HTTPS", () => {
    const findings = analyzeCookies(response(["session_id=abc123; HttpOnly"]));
    const secureFinding = findings.find((f) => f.ruleId === "SENTINEL-WEB-002");
    expect(secureFinding).toBeDefined();
    expect(secureFinding?.severity).toBe("medium");
  });

  it("flags a session cookie missing HttpOnly at medium severity", () => {
    const findings = analyzeCookies(response(["session_id=abc123; Secure"]));
    const httpOnlyFinding = findings.find((f) => f.ruleId === "SENTINEL-WEB-003");
    expect(httpOnlyFinding).toBeDefined();
    expect(httpOnlyFinding?.severity).toBe("medium");
  });

  it("flags a harmless preference cookie missing attributes at low/info severity, not medium", () => {
    const findings = analyzeCookies(response(["theme=dark"]));
    const secureFinding = findings.find((f) => f.ruleId === "SENTINEL-WEB-002");
    const httpOnlyFinding = findings.find((f) => f.ruleId === "SENTINEL-WEB-003");
    expect(secureFinding?.severity).toBe("low");
    expect(httpOnlyFinding?.severity).toBe("info");
  });

  it("does not flag a properly-attributed session cookie", () => {
    const findings = analyzeCookies(
      response(["session_id=abc123; Secure; HttpOnly; SameSite=Strict"]),
    );
    expect(findings).toHaveLength(0);
  });

  it("does not flag Secure absence over a plain HTTP response (Secure would be pointless there)", () => {
    const findings = analyzeCookies(
      response(["session_id=abc123; HttpOnly"], "http://target.example.com/"),
    );
    expect(findings.find((f) => f.ruleId === "SENTINEL-WEB-002")).toBeUndefined();
  });

  it("handles multiple Set-Cookie headers independently", () => {
    const findings = analyzeCookies(response(["a=1; Secure; HttpOnly", "auth_token=xyz"]));
    expect(
      findings.filter((f) => f.ruleId === "SENTINEL-WEB-002" || f.ruleId === "SENTINEL-WEB-003"),
    ).toHaveLength(2);
  });

  it("does not misparse an Expires attribute's embedded comma as a cookie separator", () => {
    const findings = analyzeCookies(
      response(["session_id=abc123; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Secure; HttpOnly"]),
    );
    expect(findings).toHaveLength(0);
  });
});
