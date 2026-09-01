import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { ScansService } from "./scans.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: { scan: { findMany: jest.fn(), findUnique: jest.fn() } },
}));

const ACME_SCAN = {
  id: "scan-1",
  repositoryId: "repo-1",
  repository: { id: "repo-1", owner: "acme", name: "widgets", organizationId: "org-acme" },
};

function serviceWithMemberships(memberships: Array<{ userId: string; organizationId: string }>) {
  const membershipLookup = {
    getMembershipsForUser: jest.fn().mockResolvedValue(memberships),
  } as unknown as MembershipLookupService;
  return new ScansService(membershipLookup);
}

describe("ScansService.listScansForUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an empty list without querying the database when the user has no memberships", async () => {
    const service = serviceWithMemberships([]);

    const result = await service.listScansForUser("user-nobody");

    expect(result).toEqual([]);
    expect(prisma.scan.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to only the organizations the user belongs to", async () => {
    (prisma.scan.findMany as jest.Mock).mockResolvedValue([ACME_SCAN]);
    const service = serviceWithMemberships([{ userId: "user-alice", organizationId: "org-acme" }]);

    const result = await service.listScansForUser("user-alice");

    expect(result).toEqual([ACME_SCAN]);
    expect(prisma.scan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { repository: { organizationId: { in: ["org-acme"] } } },
      }),
    );
  });
});

describe("ScansService.getScanForUser (cross-tenant IDOR regression)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the scan to a member of its repository's organization", async () => {
    (prisma.scan.findUnique as jest.Mock).mockResolvedValue(ACME_SCAN);
    const service = serviceWithMemberships([{ userId: "user-alice", organizationId: "org-acme" }]);

    const result = await service.getScanForUser("user-alice", "scan-1");

    expect(result).toEqual(ACME_SCAN);
  });

  it("blocks a user from a different organization — never returns the row, even though it exists", async () => {
    (prisma.scan.findUnique as jest.Mock).mockResolvedValue(ACME_SCAN);
    const service = serviceWithMemberships([
      { userId: "user-mallory", organizationId: "org-globex" },
    ]);

    const result = await service.getScanForUser("user-mallory", "scan-1");

    expect(result).toBeNull();
  });

  it("returns null for a nonexistent scan without ever checking membership", async () => {
    (prisma.scan.findUnique as jest.Mock).mockResolvedValue(null);
    const membershipLookup = {
      getMembershipsForUser: jest.fn(),
    } as unknown as MembershipLookupService;
    const service = new ScansService(membershipLookup);

    const result = await service.getScanForUser("user-alice", "does-not-exist");

    expect(result).toBeNull();
    expect(membershipLookup.getMembershipsForUser).not.toHaveBeenCalled();
  });
});
