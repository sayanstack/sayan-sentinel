import { encryptSecret } from "@sayan-sentinel/auth";
import type { SentinelConfig } from "@sayan-sentinel/config";
import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { HackerOneApiError } from "./hackerone-client";
import { HackerOneService } from "./hackerone.service";

const ENCRYPTION_KEY = "dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1leGFjdGx5MTI=";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    hackerOneConnection: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    hackerOneSyncedProgram: { upsert: jest.fn() },
    targetAuthorization: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    auditEvent: { create: jest.fn() },
  },
}));

function membershipLookupWith(memberships: Array<{ userId: string; organizationId: string }>) {
  return {
    getMembershipsForUser: jest.fn().mockResolvedValue(memberships),
  } as unknown as MembershipLookupService;
}

function configWith(overrides: Partial<SentinelConfig["env"]> = {}): SentinelConfig {
  return {
    env: { CREDENTIALS_ENCRYPTION_KEY: ENCRYPTION_KEY, ...overrides },
    features: { hackerOneEnabled: true },
  } as unknown as SentinelConfig;
}

const MEMBER = [{ userId: "user-1", organizationId: "org-acme" }];

describe("HackerOneService.connect", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses to connect for a caller who isn't a member of the organization", async () => {
    const service = new HackerOneService(membershipLookupWith([]), configWith());
    const outcome = await service.connect("user-1", "org-acme", "id", "token");
    expect(outcome).toEqual({ ok: false, reason: "not_member" });
    expect(prisma.hackerOneConnection.upsert).not.toHaveBeenCalled();
  });

  it("verifies credentials against the real API before storing them", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    const service = new HackerOneService(membershipLookupWith(MEMBER), configWith());

    const outcome = await service.connect("user-1", "org-acme", "bad-id", "bad-token");

    expect(outcome).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(prisma.hackerOneConnection.upsert).not.toHaveBeenCalled();
  });

  it("stores the token encrypted (never in plaintext) on success", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    const service = new HackerOneService(membershipLookupWith(MEMBER), configWith());

    await service.connect("user-1", "org-acme", "token-id", "super-secret-value");

    const call = (prisma.hackerOneConnection.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.encryptedApiToken).not.toContain("super-secret-value");
    expect(call.create.apiTokenIdentifier).toBe("token-id");
  });
});

describe("HackerOneService.syncProgramScope", () => {
  beforeEach(() => jest.clearAllMocks());

  const connection = {
    id: "conn-1",
    organizationId: "org-acme",
    apiTokenIdentifier: "token-id",
    encryptedApiToken: encryptSecret("token-value", ENCRYPTION_KEY),
  };

  function mockGithubStyleFetchForSync(scopeData: unknown[]) {
    (global.fetch as jest.Mock) = jest.fn().mockImplementation((url: string) => {
      if (url.includes("structured_scopes")) {
        return Promise.resolve({ ok: true, json: async () => ({ data: scopeData }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [{ id: "p1", type: "program", attributes: { handle: "acme", name: "Acme" } }],
        }),
      });
    });
  }

  function scopeResource(id: string, assetType: string, identifier: string, eligible = true) {
    return {
      id,
      type: "structured-scope",
      attributes: {
        asset_type: assetType,
        asset_identifier: identifier,
        eligible_for_submission: eligible,
        eligible_for_bounty: true,
        instruction: null,
        max_severity: null,
      },
    };
  }

  it("refuses to sync for a non-member", async () => {
    const service = new HackerOneService(membershipLookupWith([]), configWith());
    const outcome = await service.syncProgramScope("user-1", "org-acme", "acme");
    expect(outcome).toEqual({ ok: false, reason: "not_member" });
  });

  it("reports not_connected when no HackerOneConnection exists", async () => {
    (prisma.hackerOneConnection.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new HackerOneService(membershipLookupWith(MEMBER), configWith());
    const outcome = await service.syncProgramScope("user-1", "org-acme", "acme");
    expect(outcome).toEqual({ ok: false, reason: "not_connected" });
  });

  it("creates a verified TargetAuthorization for a scannable, eligible scope entry", async () => {
    (prisma.hackerOneConnection.findUnique as jest.Mock).mockResolvedValue(connection);
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue(null);
    mockGithubStyleFetchForSync([scopeResource("scope-1", "URL", "https://app.acme.example.com")]);
    const service = new HackerOneService(membershipLookupWith(MEMBER), configWith());

    const outcome = await service.syncProgramScope("user-1", "org-acme", "acme");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.result.created).toBe(1);
    expect(outcome.result.skipped).toHaveLength(0);
    expect(prisma.targetAuthorization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          host: "app.acme.example.com",
          verificationMethod: "HACKERONE_SCOPE",
          hackerOneScopeId: "scope-1",
          authorizedByUserId: "user-1",
        }),
      }),
    );
  });

  it("skips a non-web-scannable asset type without creating a target", async () => {
    (prisma.hackerOneConnection.findUnique as jest.Mock).mockResolvedValue(connection);
    mockGithubStyleFetchForSync([scopeResource("scope-2", "GOOGLE_PLAY_APP_ID", "com.acme.app")]);
    const service = new HackerOneService(membershipLookupWith(MEMBER), configWith());

    const outcome = await service.syncProgramScope("user-1", "org-acme", "acme");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.result.created).toBe(0);
    expect(outcome.result.skipped).toEqual([
      {
        assetType: "GOOGLE_PLAY_APP_ID",
        assetIdentifier: "com.acme.app",
        reason: "unsupported_asset_type",
      },
    ]);
    expect(prisma.targetAuthorization.create).not.toHaveBeenCalled();
  });

  it("skips a scope entry that isn't eligible for submission", async () => {
    (prisma.hackerOneConnection.findUnique as jest.Mock).mockResolvedValue(connection);
    mockGithubStyleFetchForSync([
      scopeResource("scope-3", "URL", "https://internal.acme.example.com", false),
    ]);
    const service = new HackerOneService(membershipLookupWith(MEMBER), configWith());

    const outcome = await service.syncProgramScope("user-1", "org-acme", "acme");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.result.skipped[0]?.reason).toBe("not_eligible_for_submission");
    expect(prisma.targetAuthorization.create).not.toHaveBeenCalled();
  });

  it("never resurrects a target the user explicitly revoked", async () => {
    (prisma.hackerOneConnection.findUnique as jest.Mock).mockResolvedValue(connection);
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue({
      id: "target-1",
      revokedAt: new Date(),
    });
    mockGithubStyleFetchForSync([scopeResource("scope-4", "URL", "https://app.acme.example.com")]);
    const service = new HackerOneService(membershipLookupWith(MEMBER), configWith());

    const outcome = await service.syncProgramScope("user-1", "org-acme", "acme");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.result.skipped[0]?.reason).toBe("previously_revoked_by_user");
    expect(prisma.targetAuthorization.create).not.toHaveBeenCalled();
    expect(prisma.targetAuthorization.update).not.toHaveBeenCalled();
  });

  it("refreshes expiresAt for an already-synced, non-revoked target instead of duplicating it", async () => {
    (prisma.hackerOneConnection.findUnique as jest.Mock).mockResolvedValue(connection);
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue({
      id: "target-1",
      revokedAt: null,
      verifiedAt: new Date("2020-01-01"),
    });
    mockGithubStyleFetchForSync([scopeResource("scope-5", "URL", "https://app.acme.example.com")]);
    const service = new HackerOneService(membershipLookupWith(MEMBER), configWith());

    const outcome = await service.syncProgramScope("user-1", "org-acme", "acme");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.result.updated).toBe(1);
    expect(prisma.targetAuthorization.create).not.toHaveBeenCalled();
    expect(prisma.targetAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "target-1" } }),
    );
  });

  it("records the HackerOne API error and returns hackerone_api_error without throwing", async () => {
    (prisma.hackerOneConnection.findUnique as jest.Mock).mockResolvedValue(connection);
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const service = new HackerOneService(membershipLookupWith(MEMBER), configWith());

    const outcome = await service.syncProgramScope("user-1", "org-acme", "acme");

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.reason).toBe("hackerone_api_error");
    expect(prisma.hackerOneConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastSyncError: expect.any(String) }),
      }),
    );
  });
});

describe("HackerOneService.disconnect", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses for a non-member and never touches the database", async () => {
    const service = new HackerOneService(membershipLookupWith([]), configWith());
    const outcome = await service.disconnect("user-1", "org-acme");
    expect(outcome).toEqual({ ok: false, reason: "not_member" });
    expect(prisma.hackerOneConnection.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes the connection for a member", async () => {
    const service = new HackerOneService(membershipLookupWith(MEMBER), configWith());
    const outcome = await service.disconnect("user-1", "org-acme");
    expect(outcome).toEqual({ ok: true });
    expect(prisma.hackerOneConnection.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: "org-acme" },
    });
  });
});

describe("HackerOneApiError re-export sanity", () => {
  it("is a real Error subclass", () => {
    expect(new HackerOneApiError(401, "nope")).toBeInstanceOf(Error);
  });
});
