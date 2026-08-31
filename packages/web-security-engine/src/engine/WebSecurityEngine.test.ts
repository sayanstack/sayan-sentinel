import { describe, expect, it } from "vitest";
import { scanUrl } from "./WebSecurityEngine";
import type { FetchResponseLike } from "../http/types";
import type { TargetAuthorizationRecord } from "@sayan-sentinel/hexstrike-adapter";

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

describe("scanUrl", () => {
  it("aggregates findings from every passive rule against one target", async () => {
    const result = await scanUrl("https://target.example.com/", {
      authorizations: [authorization()],
      tier: 0,
      now: NOW,
      resolver: async () => ["93.184.216.34"],
      fetchImpl: async (): Promise<FetchResponseLike> => ({
        status: 200,
        headers: { "access-control-allow-origin": "*" },
        setCookieHeaders: ["theme=dark"],
        text: async () => "<html>ok</html>",
      }),
    });

    expect(result.fetchError).toBeUndefined();
    const ruleIds = result.findings.map((f) => f.ruleId).sort();
    expect(ruleIds).toEqual([
      "SENTINEL-WEB-001",
      "SENTINEL-WEB-002",
      "SENTINEL-WEB-003",
      "SENTINEL-WEB-006",
    ]);
  });

  it("reports fetchError rather than an empty findings list when the target is not authorized", async () => {
    const result = await scanUrl("https://unauthorized.example.com/", {
      authorizations: [],
      tier: 0,
      now: NOW,
    });
    expect(result.fetchError).toContain("scope_denied");
    expect(result.findings).toHaveLength(0);
  });
});
