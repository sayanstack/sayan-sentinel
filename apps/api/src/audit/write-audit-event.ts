import { Prisma, prisma } from "@sayan-sentinel/database";

export interface AuditEventInput {
  organizationId: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  result: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes one row to the `AuditEvent` table. Never throws — an audit-log
 * write failing must not fail the operation it's recording (e.g. a target
 * verification that genuinely succeeded shouldn't error out to the caller
 * because a secondary audit insert hit a transient DB error). Returns
 * whether the write succeeded so a caller that does care can check.
 */
export async function writeAuditEvent(input: AuditEventInput): Promise<boolean> {
  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        result: input.result,
        requestId: input.requestId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return true;
  } catch {
    return false;
  }
}
