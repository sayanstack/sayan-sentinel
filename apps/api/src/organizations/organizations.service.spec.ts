import type { SentinelConfig } from "@sayan-sentinel/config";
import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { OrganizationsService } from "./organizations.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    organization: { findMany: jest.fn(), findUnique: jest.fn() },
    membership: { findMany: jest.fn() },
    aIUsage: { aggregate: jest.fn() },
  },
}));

function membershipLookupWith(memberships: Array<{ userId: string; organizationId: string }>) {
  return {
    getMembershipsForUser: jest.fn().mockResolvedValue(memberships),
  } as unknown as MembershipLookupService;
}

function configWith(overrides: Partial<SentinelConfig["env"]> = {}): SentinelConfig {
  return {
    env: { AI_MONTHLY_BUDGET_USD: 50, AI_PER_SCAN_BUDGET_USD: 2, ...overrides },
    features: { aiEnabled: true },
  } as unknown as SentinelConfig;
}

describe("OrganizationsService.listOrganizationsForUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an empty list without querying the database when the user has no memberships", async () => {
    const service = new OrganizationsService(membershipLookupWith([]), configWith());

    const result = await service.listOrganizationsForUser("user-nobody");

    expect(result).toEqual([]);
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to only the organizations the user belongs to", async () => {
    const membershipLookup = membershipLookupWith([
      { userId: "user-alice", organizationId: "org-acme" },
      { userId: "user-alice", organizationId: "org-globex" },
    ]);
    (prisma.organization.findMany as jest.Mock).mockResolvedValue([
      { id: "org-acme", name: "Acme" },
    ]);
    const service = new OrganizationsService(membershipLookup, configWith());

    const result = await service.listOrganizationsForUser("user-alice");

    expect(result).toEqual([{ id: "org-acme", name: "Acme" }]);
    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["org-acme", "org-globex"] } } }),
    );
  });
});

describe("OrganizationsService.getOrganizationDetail", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null for a cross-tenant request without querying the organization", async () => {
    const service = new OrganizationsService(
      membershipLookupWith([{ userId: "user-mallory", organizationId: "org-globex" }]),
      configWith(),
    );

    const result = await service.getOrganizationDetail("user-mallory", "org-acme");

    expect(result).toBeNull();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it("returns the organization with its members for an actual member", async () => {
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "org-acme",
      name: "Acme",
      slug: "acme",
    });
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([
      {
        userId: "user-alice",
        role: "OWNER",
        createdAt: new Date("2026-01-01"),
        user: { email: "alice@acme.example", name: "Alice", avatarUrl: null },
      },
    ]);
    const service = new OrganizationsService(
      membershipLookupWith([{ userId: "user-alice", organizationId: "org-acme" }]),
      configWith(),
    );

    const result = await service.getOrganizationDetail("user-alice", "org-acme");

    expect(result?.name).toBe("Acme");
    expect(result?.members).toEqual([
      {
        userId: "user-alice",
        email: "alice@acme.example",
        name: "Alice",
        avatarUrl: null,
        role: "OWNER",
        joinedAt: new Date("2026-01-01"),
      },
    ]);
  });
});

describe("OrganizationsService.getAiUsageSummary", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null for a cross-tenant request", async () => {
    const service = new OrganizationsService(membershipLookupWith([]), configWith());

    const result = await service.getAiUsageSummary("user-nobody", "org-acme");

    expect(result).toBeNull();
  });

  it("reports disabled (no spend figure) when no AI provider is configured", async () => {
    const service = new OrganizationsService(
      membershipLookupWith([{ userId: "user-alice", organizationId: "org-acme" }]),
      configWith({}),
    );
    (service as unknown as { config: SentinelConfig }).config.features.aiEnabled = false;

    const result = await service.getAiUsageSummary("user-alice", "org-acme");

    expect(result).toEqual({
      enabled: false,
      monthlyBudgetUsd: 0,
      perScanBudgetUsd: 0,
      spentThisMonthUsd: 0,
    });
    expect(prisma.aIUsage.aggregate).not.toHaveBeenCalled();
  });

  it("sums this month's real AIUsage rows against the configured budgets", async () => {
    (prisma.aIUsage.aggregate as jest.Mock).mockResolvedValue({ _sum: { estimatedCostUsd: 12.5 } });
    const service = new OrganizationsService(
      membershipLookupWith([{ userId: "user-alice", organizationId: "org-acme" }]),
      configWith({ AI_MONTHLY_BUDGET_USD: 50, AI_PER_SCAN_BUDGET_USD: 2 }),
    );

    const result = await service.getAiUsageSummary("user-alice", "org-acme");

    expect(result).toEqual({
      enabled: true,
      monthlyBudgetUsd: 50,
      perScanBudgetUsd: 2,
      spentThisMonthUsd: 12.5,
    });
  });
});
