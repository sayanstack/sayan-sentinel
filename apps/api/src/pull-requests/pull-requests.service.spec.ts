import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { PullRequestsService } from "./pull-requests.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: { pullRequest: { findMany: jest.fn() } },
}));

function serviceWithMemberships(memberships: Array<{ userId: string; organizationId: string }>) {
  const membershipLookup = {
    getMembershipsForUser: jest.fn().mockResolvedValue(memberships),
  } as unknown as MembershipLookupService;
  return new PullRequestsService(membershipLookup);
}

describe("PullRequestsService.listPullRequestsForUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an empty list without querying the database when the user has no memberships", async () => {
    const service = serviceWithMemberships([]);

    const result = await service.listPullRequestsForUser("user-nobody");

    expect(result).toEqual([]);
    expect(prisma.pullRequest.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query through the pull request's repository to the user's organizations", async () => {
    (prisma.pullRequest.findMany as jest.Mock).mockResolvedValue([]);
    const service = serviceWithMemberships([{ userId: "user-alice", organizationId: "org-acme" }]);

    await service.listPullRequestsForUser("user-alice");

    expect(prisma.pullRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { repository: { organizationId: { in: ["org-acme"] } } },
      }),
    );
  });
});
