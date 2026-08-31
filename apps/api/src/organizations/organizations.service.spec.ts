import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { OrganizationsService } from "./organizations.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: { organization: { findMany: jest.fn() } },
}));

describe("OrganizationsService.listOrganizationsForUser", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an empty list without querying the database when the user has no memberships", async () => {
    const membershipLookup = {
      getMembershipsForUser: jest.fn().mockResolvedValue([]),
    } as unknown as MembershipLookupService;
    const service = new OrganizationsService(membershipLookup);

    const result = await service.listOrganizationsForUser("user-nobody");

    expect(result).toEqual([]);
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to only the organizations the user belongs to", async () => {
    const membershipLookup = {
      getMembershipsForUser: jest.fn().mockResolvedValue([
        { userId: "user-alice", organizationId: "org-acme" },
        { userId: "user-alice", organizationId: "org-globex" },
      ]),
    } as unknown as MembershipLookupService;
    (prisma.organization.findMany as jest.Mock).mockResolvedValue([
      { id: "org-acme", name: "Acme" },
    ]);
    const service = new OrganizationsService(membershipLookup);

    const result = await service.listOrganizationsForUser("user-alice");

    expect(result).toEqual([{ id: "org-acme", name: "Acme" }]);
    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["org-acme", "org-globex"] } } }),
    );
  });
});
