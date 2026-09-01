import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { FindingsService } from "./findings.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: { finding: { findMany: jest.fn() } },
}));

function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: "finding-1",
    repositoryId: "repo-1",
    severity: "HIGH",
    status: "OPEN",
    updatedAt: new Date("2026-01-01"),
    repository: { id: "repo-1", owner: "acme", name: "widgets" },
    ...overrides,
  };
}

function serviceWithMemberships(memberships: Array<{ userId: string; organizationId: string }>) {
  const membershipLookup = {
    getMembershipsForUser: jest.fn().mockResolvedValue(memberships),
  } as unknown as MembershipLookupService;
  return new FindingsService(membershipLookup);
}

describe("FindingsService.listFindingsForUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an empty list without querying the database when the user has no memberships", async () => {
    const service = serviceWithMemberships([]);

    const result = await service.listFindingsForUser("user-nobody");

    expect(result).toEqual([]);
    expect(prisma.finding.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to only the organizations the user belongs to", async () => {
    (prisma.finding.findMany as jest.Mock).mockResolvedValue([]);
    const service = serviceWithMemberships([{ userId: "user-alice", organizationId: "org-acme" }]);

    await service.listFindingsForUser("user-alice");

    expect(prisma.finding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { repository: { organizationId: { in: ["org-acme"] } } },
      }),
    );
  });

  it("applies repositoryId/severity/status filters onto the where clause", async () => {
    (prisma.finding.findMany as jest.Mock).mockResolvedValue([]);
    const service = serviceWithMemberships([{ userId: "user-alice", organizationId: "org-acme" }]);

    await service.listFindingsForUser("user-alice", {
      repositoryId: "repo-1",
      severity: "CRITICAL",
      status: "OPEN",
    });

    expect(prisma.finding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          repository: { organizationId: { in: ["org-acme"] } },
          repositoryId: "repo-1",
          severity: "CRITICAL",
          status: "OPEN",
        },
      }),
    );
  });

  it("sorts results by severity priority, not the enum's alphabetical order", async () => {
    (prisma.finding.findMany as jest.Mock).mockResolvedValue([
      finding({ id: "f-info", severity: "INFO" }),
      finding({ id: "f-critical", severity: "CRITICAL" }),
      finding({ id: "f-medium", severity: "MEDIUM" }),
      finding({ id: "f-high", severity: "HIGH" }),
      finding({ id: "f-low", severity: "LOW" }),
    ]);
    const service = serviceWithMemberships([{ userId: "user-alice", organizationId: "org-acme" }]);

    const result = await service.listFindingsForUser("user-alice");

    expect(result.map((f) => f.id)).toEqual([
      "f-critical",
      "f-high",
      "f-medium",
      "f-low",
      "f-info",
    ]);
  });
});
