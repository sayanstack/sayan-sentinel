import { describe, expect, it, vi } from "vitest";
import type {
  DynamicValidationToolResult,
  IDynamicValidationClient,
} from "./client/dynamic-validation-http-client";
import { RemoteDynamicValidationProvider } from "./provider";
import type { TargetAuthorizationRecord } from "./scope-guard/types";

const NOW = new Date("2026-08-31T00:00:00Z");
const FUTURE = new Date("2026-12-31T00:00:00Z");
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

function fakeClient(overrides: Partial<IDynamicValidationClient> = {}): IDynamicValidationClient {
  return {
    health: vi.fn(async (): Promise<DynamicValidationToolResult> => ({ success: true })),
    telemetry: vi.fn(async (): Promise<DynamicValidationToolResult> => ({ success: true })),
    runTool: vi.fn(async (): Promise<DynamicValidationToolResult> => ({
      success: true,
      findings: [],
    })),
    processStatus: vi.fn(async (): Promise<DynamicValidationToolResult> => ({ success: true })),
    terminateProcess: vi.fn(async (): Promise<DynamicValidationToolResult> => ({ success: true })),
    ...overrides,
  };
}

describe("RemoteDynamicValidationProvider", () => {
  describe("healthCheck", () => {
    it("reports available when the client reports success", async () => {
      const provider = new RemoteDynamicValidationProvider(fakeClient());
      expect(await provider.healthCheck()).toEqual({ available: true });
    });

    it("reports unavailable with the real reason when the client fails", async () => {
      const client = fakeClient({
        health: vi.fn(async () => ({ success: false, error: "connection refused" })),
      });
      const provider = new RemoteDynamicValidationProvider(client);
      const health = await provider.healthCheck();
      expect(health.available).toBe(false);
      expect(health.reason).toBe("connection refused");
    });
  });

  describe("capabilities", () => {
    it("only offers Tier 0 and Tier 1 capabilities, never Tier 2 or 3", async () => {
      const provider = new RemoteDynamicValidationProvider(fakeClient());
      const capabilities = await provider.capabilities();
      expect(capabilities.every((c) => c.tier <= 1)).toBe(true);
      expect(capabilities.length).toBeGreaterThan(0);
    });
  });

  describe("validate", () => {
    it("never calls the dynamic validation backend when Scope Guard rejects the request", async () => {
      const client = fakeClient();
      const provider = new RemoteDynamicValidationProvider(client);

      const result = await provider.validate({
        url: "https://unauthorized.example.com/",
        tier: 0,
        validationType: "http_probe",
        authorizations: [authorization()], // authorized for a different host
        localLabMode: false,
        now: NOW,
      });

      expect(result.status).toBe("rejected_by_scope_guard");
      expect(client.runTool).not.toHaveBeenCalled();
    });

    it("rejects a tier that exceeds the capability's own supported tier, even if Scope Guard would allow the authorization", async () => {
      const client = fakeClient();
      const provider = new RemoteDynamicValidationProvider(client);

      const result = await provider.validate({
        url: "https://target.example.com/",
        tier: 1,
        validationType: "http_probe", // http_probe caps at tier 0
        authorizations: [authorization({ maxTier: 3 })], // authorization itself would allow tier 1+
        localLabMode: false,
        now: NOW,
        resolver: publicResolver,
      });

      expect(result.status).toBe("rejected_by_scope_guard");
      expect(client.runTool).not.toHaveBeenCalled();
    });

    it("calls the mapped dynamic validation tool and returns 'inconclusive' on a successful call", async () => {
      const client = fakeClient();
      const provider = new RemoteDynamicValidationProvider(client);

      const result = await provider.validate({
        url: "https://target.example.com/",
        tier: 0,
        validationType: "http_probe",
        authorizations: [authorization()],
        localLabMode: false,
        now: NOW,
        resolver: publicResolver,
      });

      expect(result.status).toBe("inconclusive");
      expect(client.runTool).toHaveBeenCalledWith(
        "httpx",
        expect.objectContaining({ target: "https://target.example.com/" }),
      );
    });

    it("maps vulnerability_scan to the nuclei tool", async () => {
      const client = fakeClient();
      const provider = new RemoteDynamicValidationProvider(client);

      await provider.validate({
        url: "https://target.example.com/",
        tier: 1,
        validationType: "vulnerability_scan",
        authorizations: [authorization({ maxTier: 1 })],
        localLabMode: false,
        now: NOW,
        resolver: publicResolver,
      });

      expect(client.runTool).toHaveBeenCalledWith(
        "nuclei",
        expect.objectContaining({ target: "https://target.example.com/" }),
      );
    });

    it("returns 'failed' — never a fabricated success — when the dynamic validation call itself fails", async () => {
      const client = fakeClient({
        runTool: vi.fn(async () => ({ success: false, error: "server unreachable" })),
      });
      const provider = new RemoteDynamicValidationProvider(client);

      const result = await provider.validate({
        url: "https://target.example.com/",
        tier: 0,
        validationType: "http_probe",
        authorizations: [authorization()],
        localLabMode: false,
        now: NOW,
        resolver: publicResolver,
      });

      expect(result.status).toBe("failed");
      expect(result.reason).toContain("server unreachable");
    });
  });

  describe("cancel", () => {
    it("is a no-op for an unknown jobId rather than throwing", async () => {
      const client = fakeClient();
      const provider = new RemoteDynamicValidationProvider(client);
      await expect(provider.cancel("unknown-job")).resolves.toBeUndefined();
      expect(client.terminateProcess).not.toHaveBeenCalled();
    });
  });
});
