import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "./membership-lookup.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    membership: { findMany: jest.fn() },
  },
}));

describe("MembershipLookupService.getMembershipsForUser", () => {
  let service: MembershipLookupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MembershipLookupService();
  });

  it("queries memberships by the real User.id from a verified session", async () => {
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([
      { userId: "cuid-real-user-id", organizationId: "org-acme" },
    ]);

    const result = await service.getMembershipsForUser("cuid-real-user-id");

    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "cuid-real-user-id" } }),
    );
    expect(result).toEqual([{ userId: "cuid-real-user-id", organizationId: "org-acme" }]);
  });

  it("returns an empty list (not an error) for a user with no memberships", async () => {
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getMembershipsForUser("cuid-no-memberships");

    expect(result).toEqual([]);
  });
});
