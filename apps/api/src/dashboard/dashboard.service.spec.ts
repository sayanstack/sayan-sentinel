import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { DashboardService } from "./dashboard.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    repository: { count: jest.fn() },
    scan: { count: jest.fn() },
    finding: { findMany: jest.fn() },
  },
}));

describe("DashboardService", () => {
  let membershipLookup: MembershipLookupService;
  let service: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    membershipLookup = { getMembershipsForUser: jest.fn() } as unknown as MembershipLookupService;
    service = new DashboardService(membershipLookup);
  });

  it("returns a perfect score and zero counts for a user with no memberships, without querying the database", async () => {
    (membershipLookup.getMembershipsForUser as jest.Mock).mockResolvedValue([]);

    const summary = await service.getSummaryForUser("user-nobody");

    expect(summary).toEqual({
      repositoryCount: 0,
      scanCount: 0,
      securityScore: 100,
      openFindingCount: 0,
      openFindingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    });
    expect(prisma.repository.count).not.toHaveBeenCalled();
  });

  it("returns a perfect score with real (empty) counts when the user has an organization but no findings yet", async () => {
    (membershipLookup.getMembershipsForUser as jest.Mock).mockResolvedValue([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);
    (prisma.repository.count as jest.Mock).mockResolvedValue(2);
    (prisma.scan.count as jest.Mock).mockResolvedValue(0);
    (prisma.finding.findMany as jest.Mock).mockResolvedValue([]);

    const summary = await service.getSummaryForUser("user-alice");

    expect(summary.repositoryCount).toBe(2);
    expect(summary.scanCount).toBe(0);
    expect(summary.securityScore).toBe(100);
    expect(summary.openFindingCount).toBe(0);
  });

  it("computes a real, lower score from actual open findings, mapping Prisma's uppercase enums correctly", async () => {
    (membershipLookup.getMembershipsForUser as jest.Mock).mockResolvedValue([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);
    (prisma.repository.count as jest.Mock).mockResolvedValue(1);
    (prisma.scan.count as jest.Mock).mockResolvedValue(1);
    (prisma.finding.findMany as jest.Mock).mockResolvedValue([
      {
        severity: "CRITICAL",
        confidence: "CONFIRMED",
        status: "OPEN",
        createdAt: new Date(),
      },
      {
        severity: "LOW",
        confidence: "LOW",
        status: "RESOLVED",
        createdAt: new Date(),
      },
    ]);

    const summary = await service.getSummaryForUser("user-alice");

    // Only the CRITICAL/OPEN finding counts (the RESOLVED one never does).
    expect(summary.openFindingCount).toBe(1);
    expect(summary.openFindingsBySeverity.critical).toBe(1);
    expect(summary.openFindingsBySeverity.low).toBe(0);
    expect(summary.securityScore).toBeLessThan(100);
  });

  it("scopes all three queries to the user's organizations", async () => {
    (membershipLookup.getMembershipsForUser as jest.Mock).mockResolvedValue([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);
    (prisma.repository.count as jest.Mock).mockResolvedValue(0);
    (prisma.scan.count as jest.Mock).mockResolvedValue(0);
    (prisma.finding.findMany as jest.Mock).mockResolvedValue([]);

    await service.getSummaryForUser("user-alice");

    expect(prisma.repository.count).toHaveBeenCalledWith({
      where: { organizationId: { in: ["org-acme"] } },
    });
    expect(prisma.scan.count).toHaveBeenCalledWith({
      where: { repository: { organizationId: { in: ["org-acme"] } } },
    });
    expect(prisma.finding.findMany).toHaveBeenCalledWith({
      where: { repository: { organizationId: { in: ["org-acme"] } } },
    });
  });
});
