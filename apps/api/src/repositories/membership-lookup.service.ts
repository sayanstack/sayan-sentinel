import { Injectable } from "@nestjs/common";
import type { MembershipRecord } from "@sayan-sentinel/auth";
import { prisma } from "@sayan-sentinel/database";
import { resolveDemoUserId } from "../common/resolve-demo-user-id";

@Injectable()
export class MembershipLookupService {
  /**
   * `Membership.userId` is a foreign key into `User.id`, but every
   * controller in this app receives an opaque `x-demo-user-id` header
   * standing in for a real session. Resolving that to the real id here —
   * the one place every controller's tenant check already funnels
   * through — means every caller downstream keeps working with whatever
   * identifier it was actually given: the returned records' `userId` is
   * remapped back to the original input so `canAccessOrganization`'s
   * later `m.userId === userId` comparison still matches, without every
   * controller needing to know about this translation. See
   * `resolveDemoUserId` for why this resolution exists at all.
   */
  async getMembershipsForUser(userId: string): Promise<MembershipRecord[]> {
    const resolvedUserId = await resolveDemoUserId(userId);
    if (!resolvedUserId) return [];

    const memberships = await prisma.membership.findMany({
      where: { userId: resolvedUserId },
      select: { userId: true, organizationId: true },
    });

    return memberships.map((m) => ({ ...m, userId }));
  }
}
