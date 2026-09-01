import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "./membership-lookup.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    membership: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

/**
 * Regression coverage for a real bug found deploying this app for real:
 * apps/web's demo identity constant is an email-shaped string
 * (`demo@sayansentinel.local`), but `Membership.userId` is a foreign key
 * into `User.id` (a generated cuid) — passing the email straight through
 * to `prisma.membership.findMany({ where: { userId } })` silently matched
 * nothing, so every tenant-scoped endpoint returned an empty list for a
 * real, seeded user with a real membership.
 */
describe("MembershipLookupService.getMembershipsForUser", () => {
  let service: MembershipLookupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MembershipLookupService();
  });

  it("passes a non-email-shaped id straight through unchanged (pre-existing behavior)", async () => {
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([
      { userId: "user-alice", organizationId: "org-acme" },
    ]);

    const result = await service.getMembershipsForUser("user-alice");

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-alice" } }),
    );
    expect(result).toEqual([{ userId: "user-alice", organizationId: "org-acme" }]);
  });

  it("resolves an email-shaped id to the real User.id before querying, then remaps the result back to the email", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "cuid-real-user-id" });
    (prisma.membership.findMany as jest.Mock).mockResolvedValue([
      { userId: "cuid-real-user-id", organizationId: "org-acme" },
    ]);

    const result = await service.getMembershipsForUser("demo@sayansentinel.local");

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "demo@sayansentinel.local" } }),
    );
    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "cuid-real-user-id" } }),
    );
    // Remapped to the original email — canAccessOrganization compares
    // against exactly what the caller passed in, not the resolved cuid.
    expect(result).toEqual([{ userId: "demo@sayansentinel.local", organizationId: "org-acme" }]);
  });

  it("returns an empty list (not an error) for an email with no matching User row", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.getMembershipsForUser("nobody@example.com");

    expect(result).toEqual([]);
    expect(prisma.membership.findMany).not.toHaveBeenCalled();
  });
});
