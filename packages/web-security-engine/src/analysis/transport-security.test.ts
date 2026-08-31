import { describe, expect, it } from "vitest";
import { analyzeTransportSecurity } from "./transport-security";
import type { SafeHttpResponse } from "../http/types";

function response(url: string, headers: Record<string, string>): SafeHttpResponse {
  return {
    url,
    status: 200,
    headers,
    setCookieHeaders: [],
    body: "",
    truncated: false,
    redirectChain: [],
  };
}

describe("analyzeTransportSecurity", () => {
  it("flags an HTTPS response with no HSTS header, at low severity", () => {
    const findings = analyzeTransportSecurity(response("https://target.example.com/", {}));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("low");
  });

  it("does not flag when Strict-Transport-Security is present", () => {
    const findings = analyzeTransportSecurity(
      response("https://target.example.com/", { "strict-transport-security": "max-age=31536000" }),
    );
    expect(findings).toHaveLength(0);
  });

  it("does not flag a plain HTTP response (HSTS is meaningless there)", () => {
    const findings = analyzeTransportSecurity(response("http://target.example.com/", {}));
    expect(findings).toHaveLength(0);
  });
});
