import { Injectable } from "@nestjs/common";
import { prisma, type AuditEvent } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";

@Injectable()
export class ActivityService {
  constructor(private readonly membershipLookup: MembershipLookupService) {}

  /** Every audit event for an organization `userId` is a member of — never a cross-tenant list. */
  async listActivityForUser(userId: string): Promise<AuditEvent[]> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    const organizationIds = memberships.map((m) => m.organizationId);
    if (organizationIds.length === 0) return [];

    return prisma.auditEvent.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
