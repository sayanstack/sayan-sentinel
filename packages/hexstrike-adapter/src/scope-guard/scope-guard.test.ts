import { describe, expect, it } from "vitest";
import { evaluateScopeGuard } from "./scope-guard";
import type { TargetAuthorizationRecord } from "./types";

const NOW = new Date("2026-08-31T00:00:00Z");
const FUTURE = new Date("2026-12-31T00:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");

const publicResolver = async () => ["93.184.216.34"];

function authorization(
  overrides: Partial<TargetAuthorizationRecord> = {},
): TargetAuthorizationRecord {
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
    ...overrides,
  };
}

describe("evaluateScopeGuard", () => {
  it("allows a request that matches a valid, verified, unexpired authorization at an in-scope tier", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://target.example.com/path",
      tier: 1,
      authorizations: [authorization()],
      localLabMode: false,
      now: NOW,
      resolver: publicResolver,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.matchedAuthorizationId).toBe("auth-1");
  });

  it("rejects an unparseable URL", async () => {
    const decision = await evaluateScopeGuard({
      url: "not a url",
      tier: 0,
      authorizations: [],
      localLabMode: false,
    });
    expect(decision).toEqual({ allowed: false, reason: "invalid_url" });
  });

  it("rejects a non-HTTP(S) scheme", async () => {
    const decision = await evaluateScopeGuard({
      url: "file:///etc/passwd",
      tier: 0,
      authorizations: [authorization({ scheme: "http" })],
      localLabMode: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("unsupported_scheme");
  });

  it("blocks localhost by default even with a matching authorization", async () => {
    const decision = await evaluateScopeGuard({
      url: "http://localhost/admin",
      tier: 0,
      authorizations: [authorization({ scheme: "http", host: "localhost", port: 80 })],
      localLabMode: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("blocked_hostname");
  });

  it("allows localhost only when localLabMode is explicitly enabled and it's otherwise authorized", async () => {
    const decision = await evaluateScopeGuard({
      url: "http://localhost:3000/",
      tier: 0,
      authorizations: [authorization({ scheme: "http", host: "localhost", port: 3000 })],
      localLabMode: true,
      now: NOW,
      resolver: async () => ["127.0.0.1"],
    });
    expect(decision.allowed).toBe(true);
  });

  it("rejects a target with no matching authorization at all", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://unauthorized.example.com/",
      tier: 0,
      authorizations: [authorization()],
      localLabMode: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("no_matching_authorization");
  });

  it("rejects when the matching authorization has been revoked", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://target.example.com/",
      tier: 0,
      authorizations: [authorization({ revokedAt: NOW })],
      localLabMode: false,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("authorization_revoked");
  });

  it("rejects when the matching authorization has expired", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://target.example.com/",
      tier: 0,
      authorizations: [authorization({ expiresAt: PAST })],
      localLabMode: false,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("authorization_expired");
  });

  it("rejects when the matching authorization has never been verified", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://target.example.com/",
      tier: 0,
      authorizations: [authorization({ verifiedAt: null })],
      localLabMode: false,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("authorization_not_verified");
  });

  it("rejects when the requested tier exceeds the authorization's max tier", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://target.example.com/",
      tier: 2,
      authorizations: [authorization({ maxTier: 1 })],
      localLabMode: false,
      now: NOW,
      resolver: publicResolver,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("tier_exceeds_authorization");
  });

  it("rejects a path outside the authorization's allowed path prefixes", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://target.example.com/admin/secrets",
      tier: 0,
      authorizations: [authorization({ allowedPathPrefixes: ["/api/"] })],
      localLabMode: false,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("path_not_allowed");
  });

  it("allows a path that matches one of several allowed path prefixes", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://target.example.com/api/v1/users",
      tier: 0,
      authorizations: [authorization({ allowedPathPrefixes: ["/health", "/api/"] })],
      localLabMode: false,
      now: NOW,
      resolver: publicResolver,
    });
    expect(decision.allowed).toBe(true);
  });

  it("rejects when the host resolves to a private address, even though the hostname itself is authorized (DNS rebinding)", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://target.example.com/",
      tier: 0,
      authorizations: [authorization()],
      localLabMode: false,
      now: NOW,
      resolver: async () => ["10.0.0.5"],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("host_resolves_to_blocked_address");
    expect(decision.resolvedAddresses).toEqual(["10.0.0.5"]);
  });

  it("rejects a literal cloud-metadata IP even with a matching authorization for it", async () => {
    const decision = await evaluateScopeGuard({
      url: "http://169.254.169.254/latest/meta-data/",
      tier: 0,
      authorizations: [
        authorization({
          scheme: "http",
          host: "169.254.169.254",
          port: 80,
          allowedPathPrefixes: [],
        }),
      ],
      localLabMode: false,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("host_resolves_to_blocked_address");
  });

  it("matches authorizations by exact scheme+host+port, not host alone", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://target.example.com:8443/",
      tier: 0,
      // authorization is for the default 443, not 8443
      authorizations: [authorization({ port: 443 })],
      localLabMode: false,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("no_matching_authorization");
  });

  it("checks are case-insensitive on hostname", async () => {
    const decision = await evaluateScopeGuard({
      url: "https://TARGET.EXAMPLE.COM/",
      tier: 0,
      authorizations: [authorization()],
      localLabMode: false,
      now: NOW,
      resolver: publicResolver,
    });
    expect(decision.allowed).toBe(true);
  });
});
