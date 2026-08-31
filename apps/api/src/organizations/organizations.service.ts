import { Injectable } from "@nestjs/common";
import { prisma, type Organization } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";

@Injectable()
export class OrganizationsService {
  constructor(private readonly membershipLookup: MembershipLookupService) {}

  /** Every organization the user is a member of — never all organizations in the system. */
  async listOrganizationsForUser(userId: string): Promise<Organization[]> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    if (memberships.length === 0) return [];

    return prisma.organization.findMany({
      where: { id: { in: memberships.map((m) => m.organizationId) } },
      orderBy: { name: "asc" },
    });
  }
}
