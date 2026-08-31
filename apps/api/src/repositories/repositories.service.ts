import { Injectable } from "@nestjs/common";
import { canAccessOrganization } from "@sayan-sentinel/auth";
import { prisma } from "@sayan-sentinel/database";
import { MembershipLookupService } from "./membership-lookup.service";

@Injectable()
export class RepositoriesService {
  constructor(private readonly membershipLookup: MembershipLookupService) {}

  /**
   * Returns the repository only if `userId` belongs to an organization
   * that owns it — returns `null` (never the row, never a distinct
   * "forbidden" signal) for a cross-tenant request, so the controller can
   * map it to 404 rather than confirming to an unauthorized caller that
   * the resource exists at all (Section 35 IDOR regression coverage).
   */
  async getRepositoryForUser(userId: string, repositoryId: string) {
    const repository = await prisma.repository.findUnique({ where: { id: repositoryId } });
    if (!repository) return null;

    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    if (!canAccessOrganization(userId, repository.organizationId, memberships)) {
      return null;
    }

    return repository;
  }
}
