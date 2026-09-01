import { describe, expect, it } from "vitest";
import { analyzeCors } from "./cors";
import { SafeHttpClient } from "../http/SafeHttpClient";
import type { FetchResponseLike } from "../http/types";
import type { TargetAuthorizationRecord } from "@sayan-sentinel/security-core";

const FUTURE = new Date("2026-12-31T00:00:00Z");
const NOW = new Date("2026-08-31T00:00:00Z");

function authorization(): TargetAuthorizationRecord {
  return {
    id: "auth-1",
    scheme: "https",
    host: "target.example.com",
    port: 443,
    allowedPathPrefixes: [],
    maxTier: 1,
    expiresAt: FUTURE,
    verifiedAt: NOW,
    revokedAt: null,
  };
}

function clientWithResponse(headers: Record<string, string>): SafeHttpClient {
  return new SafeHttpClient({
    authorizations: [authorization()],
    tier: 0,
    now: NOW,
    resolver: async () => ["93.184.216.34"],
    fetchImpl: async (): Promise<FetchResponseLike> => ({
      status: 200,
      headers,
      text: async () => "",
    }),
  });
}

describe("analyzeCors", () => {
  it("flags arbitrary origin reflection combined with credentials as high severity", async () => {
    const client = clientWithResponse({
      "access-control-allow-origin": "https://sentinel-cors-probe.invalid",
      "access-control-allow-credentials": "true",
    });
    const findings = await analyzeCors(client, "https://target.example.com/api");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("high");
    expect(findings[0]?.title).toContain("Arbitrary Origin Reflection");
  });

  it("flags wildcard origin with credentials at medium severity", async () => {
    const client = clientWithResponse({
      "access-control-allow-origin": "*",
      "access-control-allow-credentials": "true",
    });
    const findings = await analyzeCors(client, "https://target.example.com/api");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("medium");
  });

  it("flags a bare wildcard origin at info severity only", async () => {
    const client = clientWithResponse({ "access-control-allow-origin": "*" });
    const findings = await analyzeCors(client, "https://target.example.com/api");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("info");
  });

  it("does not flag a response that echoes only its own fixed, legitimate origin", async () => {
    const client = clientWithResponse({ "access-control-allow-origin": "https://app.example.com" });
    const findings = await analyzeCors(client, "https://target.example.com/api");
    expect(findings).toHaveLength(0);
  });

  it("does not flag a response with no CORS headers at all", async () => {
    const client = clientWithResponse({});
    const findings = await analyzeCors(client, "https://target.example.com/api");
    expect(findings).toHaveLength(0);
  });
});
