import type { TargetAuthorization } from "@sayan-sentinel/database";
import { evaluateScopeGuard } from "@sayan-sentinel/hexstrike-adapter";
import { toScopeGuardRecord } from "./to-scope-guard-record";

jest.mock("@sayan-sentinel/database", () => ({}));

function target(overrides: Partial<TargetAuthorization> = {}): TargetAuthorization {
  return {
    id: "target-1",
    organizationId: "org-acme",
    repositoryId: null,
    scheme: "https",
    host: "app.acme.example.com",
    port: 443,
    allowedPathPrefixes: ["/api/"],
    verificationMethod: "DNS_TXT",
    verificationChallenge: "abc123",
    verifiedAt: new Date("2026-08-31T00:00:00Z"),
    authorizedByUserId: "user-alice",
    expiresAt: new Date("2026-12-31T00:00:00Z"),
    rateLimitRps: 2,
    maxTier: 1,
    revokedAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  } as TargetAuthorization;
}

describe("toScopeGuardRecord", () => {
  it("maps every field Scope Guard needs", () => {
    const record = toScopeGuardRecord(target());
    expect(record).toEqual({
      id: "target-1",
      scheme: "https",
      host: "app.acme.example.com",
      port: 443,
      allowedPathPrefixes: ["/api/"],
      maxTier: 1,
      expiresAt: new Date("2026-12-31T00:00:00Z"),
      revokedAt: null,
      verifiedAt: new Date("2026-08-31T00:00:00Z"),
    });
  });

  it("produces a record Scope Guard genuinely accepts for a verified, unexpired target", async () => {
    const record = toScopeGuardRecord(target());
    const decision = await evaluateScopeGuard({
      url: "https://app.acme.example.com/api/health",
      tier: 0,
      authorizations: [record],
      localLabMode: false,
      now: new Date("2026-08-31T12:00:00Z"),
      resolver: async () => ["93.184.216.34"],
    });
    expect(decision.allowed).toBe(true);
  });

  it("produces a record Scope Guard genuinely rejects once revoked", async () => {
    const record = toScopeGuardRecord(target({ revokedAt: new Date("2026-08-31T06:00:00Z") }));
    const decision = await evaluateScopeGuard({
      url: "https://app.acme.example.com/api/health",
      tier: 0,
      authorizations: [record],
      localLabMode: false,
      now: new Date("2026-08-31T12:00:00Z"),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("authorization_revoked");
  });
});
