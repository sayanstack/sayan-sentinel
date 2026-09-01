import { Prisma, prisma } from "@sayan-sentinel/database";
import { resolveDemoUserId } from "../common/resolve-demo-user-id";

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
    // AuditEvent.actorUserId is a foreign key into User.id — see
    // resolveDemoUserId's own doc comment for why the caller-supplied
    // value (the demo-auth stand-in header) might be email-shaped instead.
    // Falls back to omitting the actor (never to failing the whole write)
    // when it can't be resolved, e.g. an unrecognized email.
    const actorUserId = input.actorUserId
      ? ((await resolveDemoUserId(input.actorUserId)) ?? undefined)
      : undefined;

    await prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorUserId,
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
