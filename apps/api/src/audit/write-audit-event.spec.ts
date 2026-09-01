import { prisma } from "@sayan-sentinel/database";
import { writeAuditEvent } from "./write-audit-event";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    auditEvent: { create: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

describe("writeAuditEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  const baseInput = {
    organizationId: "org-acme",
    action: "TARGET_CREATED",
    resourceType: "TargetAuthorization",
    resourceId: "target-1",
    result: "success",
  };

  it("writes the actorUserId through unchanged when it isn't email-shaped", async () => {
    (prisma.auditEvent.create as jest.Mock).mockResolvedValue({});

    const ok = await writeAuditEvent({ ...baseInput, actorUserId: "user-alice" });

    expect(ok).toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorUserId: "user-alice" }) }),
    );
  });

  it("resolves an email-shaped actorUserId to the real User.id before writing", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "cuid-real-user-id" });
    (prisma.auditEvent.create as jest.Mock).mockResolvedValue({});

    const ok = await writeAuditEvent({
      ...baseInput,
      actorUserId: "demo@sayansentinel.local",
    });

    expect(ok).toBe(true);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorUserId: "cuid-real-user-id" }),
      }),
    );
  });

  it("omits the actor rather than failing the write when the email can't be resolved", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.auditEvent.create as jest.Mock).mockResolvedValue({});

    const ok = await writeAuditEvent({ ...baseInput, actorUserId: "nobody@example.com" });

    expect(ok).toBe(true);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorUserId: undefined }) }),
    );
  });

  it("returns false instead of throwing when the underlying write fails", async () => {
    (prisma.auditEvent.create as jest.Mock).mockRejectedValue(new Error("db unavailable"));

    const ok = await writeAuditEvent({ ...baseInput, actorUserId: "user-alice" });

    expect(ok).toBe(false);
  });
});
