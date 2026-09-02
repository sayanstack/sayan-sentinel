import { Injectable } from "@nestjs/common";
import type { MembershipRecord } from "@sayan-sentinel/auth";
import { prisma } from "@sayan-sentinel/database";

@Injectable()
export class MembershipLookupService {
  async getMembershipsForUser(userId: string): Promise<MembershipRecord[]> {
    return prisma.membership.findMany({
      where: { userId },
      select: { userId: true, organizationId: true },
    });
  }
}
