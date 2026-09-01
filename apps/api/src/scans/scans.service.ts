import { Injectable } from "@nestjs/common";
import { canAccessOrganization } from "@sayan-sentinel/auth";
import { prisma, type Scan } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";

export interface ScanWithRepository extends Scan {
  repository: { id: string; owner: string; name: string; organizationId?: string };
}

@Injectable()
export class ScansService {
  constructor(private readonly membershipLookup: MembershipLookupService) {}

  /** Every scan for a repository owned by any organization `userId` is a member of — never a cross-tenant list. */
  async listScansForUser(userId: string): Promise<ScanWithRepository[]> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    const organizationIds = memberships.map((m) => m.organizationId);
    if (organizationIds.length === 0) return [];

    return prisma.scan.findMany({
      where: { repository: { organizationId: { in: organizationIds } } },
      include: { repository: { select: { id: true, owner: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /** Same "null for both missing and cross-tenant" IDOR pattern as `RepositoriesService.getRepositoryForUser`. */
  async getScanForUser(userId: string, scanId: string): Promise<ScanWithRepository | null> {
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        repository: { select: { id: true, owner: true, name: true, organizationId: true } },
      },
    });
    if (!scan) return null;

    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    if (!canAccessOrganization(userId, scan.repository.organizationId, memberships)) {
      return null;
    }

    return scan;
  }
}
