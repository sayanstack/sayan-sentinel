import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "./membership-lookup.service";
import { RepositoriesService } from "./repositories.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: { repository: { findUnique: jest.fn(), findMany: jest.fn() } },
}));

const ACME_REPO = { id: "repo-1", organizationId: "org-acme", owner: "acme", name: "widgets" };

describe("RepositoriesService (cross-tenant IDOR regression)", () => {
  let membershipLookup: MembershipLookupService;
  let service: RepositoriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    membershipLookup = { getMembershipsForUser: jest.fn() } as unknown as MembershipLookupService;
    service = new RepositoriesService(membershipLookup);
  });

  it("returns the repository to a user who is a member of its organization", async () => {
    (prisma.repository.findUnique as jest.Mock).mockResolvedValue(ACME_REPO);
    (membershipLookup.getMembershipsForUser as jest.Mock).mockResolvedValue([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);

    const result = await service.getRepositoryForUser("user-alice", "repo-1");

    expect(result).toEqual(ACME_REPO);
  });

  it("blocks a user from a different organization — never returns the row, even though it exists", async () => {
    (prisma.repository.findUnique as jest.Mock).mockResolvedValue(ACME_REPO);
    (membershipLookup.getMembershipsForUser as jest.Mock).mockResolvedValue([
      { userId: "user-mallory", organizationId: "org-globex" },
    ]);

    const result = await service.getRepositoryForUser("user-mallory", "repo-1");

    expect(result).toBeNull();
  });

  it("blocks a user with no memberships at all", async () => {
    (prisma.repository.findUnique as jest.Mock).mockResolvedValue(ACME_REPO);
    (membershipLookup.getMembershipsForUser as jest.Mock).mockResolvedValue([]);

    const result = await service.getRepositoryForUser("user-nobody", "repo-1");

    expect(result).toBeNull();
  });

  it("returns null for a nonexistent repository without ever checking membership", async () => {
    (prisma.repository.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.getRepositoryForUser("user-alice", "does-not-exist");

    expect(result).toBeNull();
    expect(membershipLookup.getMembershipsForUser).not.toHaveBeenCalled();
  });
});

describe("RepositoriesService.listRepositoriesForUser", () => {
  let membershipLookup: MembershipLookupService;
  let service: RepositoriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    membershipLookup = { getMembershipsForUser: jest.fn() } as unknown as MembershipLookupService;
    service = new RepositoriesService(membershipLookup);
  });

  it("returns an empty list without querying the database when the user has no memberships", async () => {
    (membershipLookup.getMembershipsForUser as jest.Mock).mockResolvedValue([]);

    const result = await service.listRepositoriesForUser("user-nobody");

    expect(result).toEqual([]);
    expect(prisma.repository.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to only the organizations the user belongs to", async () => {
    (membershipLookup.getMembershipsForUser as jest.Mock).mockResolvedValue([
      { userId: "user-alice", organizationId: "org-acme" },
      { userId: "user-alice", organizationId: "org-globex" },
    ]);
    (prisma.repository.findMany as jest.Mock).mockResolvedValue([ACME_REPO]);

    const result = await service.listRepositoriesForUser("user-alice");

    expect(result).toEqual([ACME_REPO]);
    expect(prisma.repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: { in: ["org-acme", "org-globex"] } },
      }),
    );
  });
});
