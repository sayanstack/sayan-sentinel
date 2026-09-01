import { prisma } from "@sayan-sentinel/database";

/**
 * Resolves the `x-demo-user-id` header's value to a real `User.id`.
 *
 * Every `User`-referencing foreign key in the schema (`Membership.userId`,
 * `TargetAuthorization.authorizedByUserId`, `AuditEvent.actorUserId`, ...)
 * points at `User.id` — a generated cuid. But `apps/web`'s demo identity
 * constant (standing in for a real session) is the email-shaped string
 * `"demo@sayansentinel.local"`, not a raw id. Passing that email straight
 * through to a query filtered or a row created against one of those
 * columns either silently matches nothing (a `WHERE` filter) or throws a
 * foreign-key violation (a `create`) — both were real bugs found only by
 * actually deploying this app against a live, FK-enforcing database for
 * the first time; every unit test in this codebase mocks Prisma directly,
 * so neither ever surfaced before that.
 *
 * An id that doesn't look like an email (e.g. this codebase's own tests'
 * `"user-alice"`, or a real internal id) is returned unchanged.
 */
export async function resolveDemoUserId(userId: string): Promise<string | null> {
  if (!userId.includes("@")) return userId;
  const user = await prisma.user.findUnique({ where: { email: userId }, select: { id: true } });
  return user?.id ?? null;
}
