import { prisma } from "@sayan-sentinel/database";
import { resolveDemoUserId } from "./resolve-demo-user-id";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

describe("resolveDemoUserId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns a non-email-shaped id unchanged, without querying the database", async () => {
    const result = await resolveDemoUserId("user-alice");

    expect(result).toBe("user-alice");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("resolves an email-shaped id to the matching User.id", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "cuid-real-user-id" });

    const result = await resolveDemoUserId("demo@sayansentinel.local");

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "demo@sayansentinel.local" } }),
    );
    expect(result).toBe("cuid-real-user-id");
  });

  it("returns null for an email with no matching User row", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await resolveDemoUserId("nobody@example.com");

    expect(result).toBeNull();
  });
});
