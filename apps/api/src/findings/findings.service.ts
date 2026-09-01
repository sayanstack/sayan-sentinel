import { Injectable } from "@nestjs/common";
import { prisma, type Finding, type Prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";

/**
 * Prisma's `orderBy` on an enum column sorts alphabetically
 * (CRITICAL, HIGH, INFO, LOW, MEDIUM) — not severity priority — so
 * severity ordering is applied in application code against this table
 * instead of trusting the DB's enum order.
 */
const SEVERITY_RANK: Record<Finding["severity"], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export interface FindingWithRepository extends Finding {
  repository: { id: string; owner: string; name: string };
}

export interface FindingFilters {
  repositoryId?: string;
  severity?: Finding["severity"];
  status?: Finding["status"];
}

@Injectable()
export class FindingsService {
  constructor(private readonly membershipLookup: MembershipLookupService) {}

  /** Every finding for a repository owned by any organization `userId` is a member of — never a cross-tenant list. */
  async listFindingsForUser(
    userId: string,
    filters: FindingFilters = {},
  ): Promise<FindingWithRepository[]> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    const organizationIds = memberships.map((m) => m.organizationId);
    if (organizationIds.length === 0) return [];

    const where: Prisma.FindingWhereInput = {
      repository: { organizationId: { in: organizationIds } },
    };
    if (filters.repositoryId) where.repositoryId = filters.repositoryId;
    if (filters.severity) where.severity = filters.severity;
    if (filters.status) where.status = filters.status;

    const findings = await prisma.finding.findMany({
      where,
      include: { repository: { select: { id: true, owner: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }
}
