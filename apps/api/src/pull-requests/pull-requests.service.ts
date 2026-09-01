import { Injectable } from "@nestjs/common";
import { prisma, type PullRequest } from "@sayan-sentinel/database";
import { MembershipLookupService } from "../repositories/membership-lookup.service";

export interface PullRequestWithRepository extends PullRequest {
  repository: { id: string; owner: string; name: string };
}

@Injectable()
export class PullRequestsService {
  constructor(private readonly membershipLookup: MembershipLookupService) {}

  /** Every remediation pull request Sentinel has opened for a repository owned by any organization `userId` is a member of — never a cross-tenant list. */
  async listPullRequestsForUser(userId: string): Promise<PullRequestWithRepository[]> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    const organizationIds = memberships.map((m) => m.organizationId);
    if (organizationIds.length === 0) return [];

    return prisma.pullRequest.findMany({
      where: { repository: { organizationId: { in: organizationIds } } },
      include: { repository: { select: { id: true, owner: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
