import { prisma } from "@sayan-sentinel/database";
import { writeAuditEvent } from "./write-audit-event";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    auditEvent: { create: jest.fn() },
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

  it("writes the real actorUserId from a verified session through unchanged", async () => {
    (prisma.auditEvent.create as jest.Mock).mockResolvedValue({});

    const ok = await writeAuditEvent({ ...baseInput, actorUserId: "cuid-real-user-id" });

    expect(ok).toBe(true);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorUserId: "cuid-real-user-id" }),
      }),
    );
  });

  it("omits the actor when none was given", async () => {
    (prisma.auditEvent.create as jest.Mock).mockResolvedValue({});

    const ok = await writeAuditEvent(baseInput);

    expect(ok).toBe(true);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorUserId: undefined }) }),
    );
  });

  it("returns false instead of throwing when the underlying write fails", async () => {
    (prisma.auditEvent.create as jest.Mock).mockRejectedValue(new Error("db unavailable"));

    const ok = await writeAuditEvent({ ...baseInput, actorUserId: "cuid-real-user-id" });

    expect(ok).toBe(false);
  });
});
