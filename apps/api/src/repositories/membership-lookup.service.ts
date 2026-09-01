import { Injectable } from "@nestjs/common";
import type { MembershipRecord } from "@sayan-sentinel/auth";
import { prisma } from "@sayan-sentinel/database";

@Injectable()
export class MembershipLookupService {
  /**
   * `Membership.userId` is a foreign key into `User.id` (a generated cuid),
   * but every controller in this app receives an opaque `x-demo-user-id`
   * header standing in for a real session — and the frontend's demo
   * identity constant is an email-shaped string
   * (`demo@sayansentinel.local`), not a raw id. Resolving that email to
   * the real `User.id` here (once, in the one place every controller's
   * tenant check already funnels through) means every caller downstream
   * keeps working with whatever identifier it was actually given: the
   * returned records' `userId` is remapped back to the original input so
   * `canAccessOrganization`'s later `m.userId === userId` comparison
   * still matches, without every controller needing to know about this
   * translation. A non-email-shaped id (e.g. this package's own tests'
   * `"user-alice"`) is used as-is, unchanged from before.
   */
  async getMembershipsForUser(userId: string): Promise<MembershipRecord[]> {
    const resolvedUserId = await this.resolveUserId(userId);
    if (!resolvedUserId) return [];

    const memberships = await prisma.membership.findMany({
      where: { userId: resolvedUserId },
      select: { userId: true, organizationId: true },
    });

    return memberships.map((m) => ({ ...m, userId }));
  }

  private async resolveUserId(userId: string): Promise<string | null> {
    if (!userId.includes("@")) return userId;
    const user = await prisma.user.findUnique({ where: { email: userId }, select: { id: true } });
    return user?.id ?? null;
  }
}
