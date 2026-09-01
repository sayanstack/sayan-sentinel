import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { ActivityService } from "./activity.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: { auditEvent: { findMany: jest.fn() } },
}));

function serviceWithMemberships(memberships: Array<{ userId: string; organizationId: string }>) {
  const membershipLookup = {
    getMembershipsForUser: jest.fn().mockResolvedValue(memberships),
  } as unknown as MembershipLookupService;
  return new ActivityService(membershipLookup);
}

describe("ActivityService.listActivityForUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an empty list without querying the database when the user has no memberships", async () => {
    const service = serviceWithMemberships([]);

    const result = await service.listActivityForUser("user-nobody");

    expect(result).toEqual([]);
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to only the organizations the user belongs to, newest first", async () => {
    (prisma.auditEvent.findMany as jest.Mock).mockResolvedValue([]);
    const service = serviceWithMemberships([
      { userId: "user-alice", organizationId: "org-acme" },
      { userId: "user-alice", organizationId: "org-globex" },
    ]);

    await service.listActivityForUser("user-alice");

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: { in: ["org-acme", "org-globex"] } },
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});
