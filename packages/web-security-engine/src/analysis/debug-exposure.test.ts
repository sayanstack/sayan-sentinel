import { describe, expect, it } from "vitest";
import { analyzeDebugExposure } from "./debug-exposure";
import type { SafeHttpResponse } from "../http/types";

function response(body: string, status = 500): SafeHttpResponse {
  return {
    url: "https://target.example.com/",
    status,
    headers: {},
    setCookieHeaders: [],
    body,
    truncated: false,
    redirectChain: [],
  };
}

describe("analyzeDebugExposure", () => {
  it("flags a Node.js stack trace on a 500 response at medium severity", () => {
    const body =
      "Error: something broke\n    at handler (/app/src/routes.js:42:15)\n    at Layer.handle (/app/node_modules/express/lib/router/layer.js:95:5)";
    const findings = analyzeDebugExposure(response(body, 500));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("medium");
  });

  it("flags a Django debug page", () => {
    const body = "Django Version: 5.0\nException Type: KeyError\nException Value: 'user_id'";
    const findings = analyzeDebugExposure(response(body, 500));
    expect(findings.some((f) => f.evidence.some((e) => e.detail === "Django debug page"))).toBe(
      true,
    );
  });

  it("lowers severity when the same signature appears on a 200 response", () => {
    const body = 'Traceback (most recent call last):\n  File "app.py", line 10, in <module>';
    const findings = analyzeDebugExposure(response(body, 200));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("low");
  });

  it("does not flag ordinary body text that merely mentions the word error", () => {
    const findings = analyzeDebugExposure(
      response("Sorry, an error occurred. Please try again later.", 500),
    );
    expect(findings).toHaveLength(0);
  });

  it("does not flag an empty or unrelated response body", () => {
    expect(analyzeDebugExposure(response("<html><body>OK</body></html>", 200))).toHaveLength(0);
  });
});
