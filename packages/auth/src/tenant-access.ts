export interface MembershipRecord {
  userId: string;
  organizationId: string;
}

export class TenantAccessDeniedError extends Error {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {
    super(`User "${userId}" is not a member of organization "${organizationId}"`);
    this.name = "TenantAccessDeniedError";
  }
}

/**
 * The single choke point every tenant-scoped resource lookup must pass
 * through. Deliberately dependency-free of any HTTP/framework concept —
 * it takes the caller's already-loaded memberships and the resource's
 * organizationId and returns a plain boolean, so it can be unit-tested
 * without a database, a request object, or a session, and reused
 * identically from a NestJS guard, a GraphQL resolver, or a worker job.
 *
 * Every tenant-owned row in the Prisma schema carries an explicit
 * organizationId for exactly this reason — this check is always made
 * directly against the row being accessed, never inferred transitively
 * through a join that could be gotten wrong.
 */
export function canAccessOrganization(
  userId: string,
  organizationId: string,
  memberships: readonly MembershipRecord[],
): boolean {
  return memberships.some((m) => m.userId === userId && m.organizationId === organizationId);
}

/**
 * Throws `TenantAccessDeniedError` instead of returning a boolean, for
 * call sites that want to fail fast (e.g. a guard's `canActivate`). The
 * HTTP layer should map this to 404, not 403 — confirming that a
 * cross-tenant resource *exists* is itself an information leak.
 */
export function assertOrganizationAccess(
  userId: string,
  organizationId: string,
  memberships: readonly MembershipRecord[],
): void {
  if (!canAccessOrganization(userId, organizationId, memberships)) {
    throw new TenantAccessDeniedError(userId, organizationId);
  }
}
