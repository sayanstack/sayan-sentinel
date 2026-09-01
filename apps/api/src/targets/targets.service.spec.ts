import { prisma } from "@sayan-sentinel/database";
import { generateVerificationChallenge, verifyTarget } from "@sayan-sentinel/security-core";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { TargetsService } from "./targets.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    targetAuthorization: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@sayan-sentinel/security-core", () => ({
  generateVerificationChallenge: jest.fn(),
  verifyTarget: jest.fn(),
}));

const ACME_TARGET = {
  id: "target-1",
  organizationId: "org-acme",
  repositoryId: null,
  scheme: "https",
  host: "app.acme.example.com",
  port: 443,
  allowedPathPrefixes: [],
  verificationMethod: "DNS_TXT",
  verificationChallenge: "abc123",
  verifiedAt: null,
  authorizedByUserId: "user-alice",
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  rateLimitRps: 2,
  maxTier: 0,
  revokedAt: null,
  createdAt: new Date(),
};

function membershipLookupWith(memberships: Array<{ userId: string; organizationId: string }>) {
  return {
    getMembershipsForUser: jest.fn().mockResolvedValue(memberships),
  } as unknown as MembershipLookupService;
}

describe("TargetsService.createTarget", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a target for a member of the organization, generating a challenge", async () => {
    (generateVerificationChallenge as jest.Mock).mockReturnValue("generated-challenge");
    (prisma.targetAuthorization.create as jest.Mock).mockResolvedValue(ACME_TARGET);
    const membershipLookup = membershipLookupWith([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.createTarget("user-alice", "org-acme", {
      scheme: "https",
      host: "APP.ACME.EXAMPLE.COM",
      port: 443,
      verificationMethod: "DNS_TXT",
    });

    expect(result).toEqual(ACME_TARGET);
    expect(prisma.targetAuthorization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          host: "app.acme.example.com", // lowercased
          verificationChallenge: "generated-challenge",
          authorizedByUserId: "user-alice",
        }),
      }),
    );
  });

  it("refuses to create a target for an organization the user is not a member of", async () => {
    const membershipLookup = membershipLookupWith([
      { userId: "user-mallory", organizationId: "org-globex" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.createTarget("user-mallory", "org-acme", {
      scheme: "https",
      host: "app.acme.example.com",
      port: 443,
      verificationMethod: "DNS_TXT",
    });

    expect(result).toBeNull();
    expect(prisma.targetAuthorization.create).not.toHaveBeenCalled();
  });

  /**
   * Regression coverage for a real bug found deploying this app for real:
   * the demo-auth header is email-shaped (`demo@sayansentinel.local`), but
   * `TargetAuthorization.authorizedByUserId` is a foreign key into
   * `User.id` — writing the raw email straight into that column threw
   * `Foreign key constraint violated on the constraint:
   * TargetAuthorization_authorizedByUserId_fkey` in production.
   */
  it("resolves an email-shaped userId to the real User.id for authorizedByUserId", async () => {
    (generateVerificationChallenge as jest.Mock).mockReturnValue("generated-challenge");
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "cuid-real-user-id" });
    (prisma.targetAuthorization.create as jest.Mock).mockResolvedValue({
      ...ACME_TARGET,
      authorizedByUserId: "cuid-real-user-id",
    });
    const membershipLookup = membershipLookupWith([
      { userId: "demo@sayansentinel.local", organizationId: "org-acme" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.createTarget("demo@sayansentinel.local", "org-acme", {
      scheme: "https",
      host: "app.acme.example.com",
      port: 443,
      verificationMethod: "DNS_TXT",
    });

    expect(result).not.toBeNull();
    expect(prisma.targetAuthorization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authorizedByUserId: "cuid-real-user-id" }),
      }),
    );
  });

  it("refuses to create a target when the email-shaped userId can't be resolved to a User row", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const membershipLookup = membershipLookupWith([
      { userId: "ghost@example.com", organizationId: "org-acme" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.createTarget("ghost@example.com", "org-acme", {
      scheme: "https",
      host: "app.acme.example.com",
      port: 443,
      verificationMethod: "DNS_TXT",
    });

    expect(result).toBeNull();
    expect(prisma.targetAuthorization.create).not.toHaveBeenCalled();
  });
});

describe("TargetsService.getTargetForUser (cross-tenant IDOR regression)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the target to a member of its organization", async () => {
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue(ACME_TARGET);
    const membershipLookup = membershipLookupWith([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.getTargetForUser("user-alice", "target-1");
    expect(result).toEqual(ACME_TARGET);
  });

  it("returns null for a user in a different organization, even though the target exists", async () => {
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue(ACME_TARGET);
    const membershipLookup = membershipLookupWith([
      { userId: "user-mallory", organizationId: "org-globex" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.getTargetForUser("user-mallory", "target-1");
    expect(result).toBeNull();
  });

  it("returns null for a nonexistent target without checking membership", async () => {
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue(null);
    const membershipLookup = membershipLookupWith([]);
    const service = new TargetsService(membershipLookup);

    const result = await service.getTargetForUser("user-alice", "does-not-exist");
    expect(result).toBeNull();
    expect(membershipLookup.getMembershipsForUser).not.toHaveBeenCalled();
  });
});

describe("TargetsService.verifyTarget", () => {
  beforeEach(() => jest.clearAllMocks());

  function serviceForAcme() {
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue(ACME_TARGET);
    const membershipLookup = membershipLookupWith([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);
    return new TargetsService(membershipLookup);
  }

  it("marks the target verified when the verification primitive succeeds", async () => {
    (verifyTarget as jest.Mock).mockResolvedValue({
      verified: true,
      method: "dns_txt",
      detail: "matched",
    });
    (prisma.targetAuthorization.update as jest.Mock).mockResolvedValue({
      ...ACME_TARGET,
      verifiedAt: new Date(),
    });
    const service = serviceForAcme();

    const result = await service.verifyTarget("user-alice", "target-1");

    expect(result?.verificationOutcome?.verified).toBe(true);
    expect(prisma.targetAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "target-1" },
        data: expect.objectContaining({ verifiedAt: expect.any(Date) }),
      }),
    );
  });

  it("does not mark the target verified when the verification primitive fails", async () => {
    (verifyTarget as jest.Mock).mockResolvedValue({
      verified: false,
      method: "dns_txt",
      detail: "no matching record",
    });
    const service = serviceForAcme();

    const result = await service.verifyTarget("user-alice", "target-1");

    expect(result?.verificationOutcome?.verified).toBe(false);
    expect(prisma.targetAuthorization.update).not.toHaveBeenCalled();
  });

  it("refuses to re-verify a revoked target without ever calling the verification primitive", async () => {
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue({
      ...ACME_TARGET,
      revokedAt: new Date(),
    });
    const membershipLookup = membershipLookupWith([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.verifyTarget("user-alice", "target-1");

    expect(result?.verificationOutcome?.verified).toBe(false);
    expect(verifyTarget).not.toHaveBeenCalled();
  });

  it("refuses to re-verify an expired target without ever calling the verification primitive", async () => {
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue({
      ...ACME_TARGET,
      expiresAt: new Date(Date.now() - 1000),
    });
    const membershipLookup = membershipLookupWith([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.verifyTarget("user-alice", "target-1");

    expect(result?.verificationOutcome?.verified).toBe(false);
    expect(verifyTarget).not.toHaveBeenCalled();
  });

  it("returns null for a cross-tenant verify attempt, never invoking verification", async () => {
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue(ACME_TARGET);
    const membershipLookup = membershipLookupWith([
      { userId: "user-mallory", organizationId: "org-globex" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.verifyTarget("user-mallory", "target-1");

    expect(result).toBeNull();
    expect(verifyTarget).not.toHaveBeenCalled();
  });
});

describe("TargetsService.revokeTarget", () => {
  beforeEach(() => jest.clearAllMocks());

  it("revokes a target belonging to the user's organization", async () => {
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue(ACME_TARGET);
    (prisma.targetAuthorization.update as jest.Mock).mockResolvedValue({
      ...ACME_TARGET,
      revokedAt: new Date(),
    });
    const membershipLookup = membershipLookupWith([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.revokeTarget("user-alice", "target-1");
    expect(result?.revokedAt).toBeInstanceOf(Date);
  });

  it("refuses to revoke a target belonging to a different organization", async () => {
    (prisma.targetAuthorization.findUnique as jest.Mock).mockResolvedValue(ACME_TARGET);
    const membershipLookup = membershipLookupWith([
      { userId: "user-mallory", organizationId: "org-globex" },
    ]);
    const service = new TargetsService(membershipLookup);

    const result = await service.revokeTarget("user-mallory", "target-1");
    expect(result).toBeNull();
    expect(prisma.targetAuthorization.update).not.toHaveBeenCalled();
  });
});

describe("TargetsService.listTargetsForUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an empty list without querying the database when the user has no memberships", async () => {
    const membershipLookup = membershipLookupWith([]);
    const service = new TargetsService(membershipLookup);

    const result = await service.listTargetsForUser("user-nobody");
    expect(result).toEqual([]);
    expect(prisma.targetAuthorization.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to only the organizations the user belongs to", async () => {
    const membershipLookup = membershipLookupWith([
      { userId: "user-alice", organizationId: "org-acme" },
      { userId: "user-alice", organizationId: "org-globex" },
    ]);
    (prisma.targetAuthorization.findMany as jest.Mock).mockResolvedValue([ACME_TARGET]);
    const service = new TargetsService(membershipLookup);

    const result = await service.listTargetsForUser("user-alice");
    expect(result).toEqual([ACME_TARGET]);
    expect(prisma.targetAuthorization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: { in: ["org-acme", "org-globex"] } } }),
    );
  });
});
