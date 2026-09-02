import { Injectable, Inject } from "@nestjs/common";
import { canAccessOrganization } from "@sayan-sentinel/auth";
import type { SentinelConfig } from "@sayan-sentinel/config";
import { prisma, type Organization } from "@sayan-sentinel/database";
import { SENTINEL_CONFIG } from "../config/sentinel-config.constants";
import { MembershipLookupService } from "../repositories/membership-lookup.service";

export interface OrganizationMember {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  joinedAt: Date;
}

export interface OrganizationDetail extends Organization {
  members: OrganizationMember[];
}

export interface AiUsageSummary {
  enabled: boolean;
  monthlyBudgetUsd: number;
  perScanBudgetUsd: number;
  spentThisMonthUsd: number;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly membershipLookup: MembershipLookupService,
    @Inject(SENTINEL_CONFIG) private readonly config: SentinelConfig,
  ) {}

  /** Every organization the user is a member of — never all organizations in the system. */
  async listOrganizationsForUser(userId: string): Promise<Organization[]> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    if (memberships.length === 0) return [];

    return prisma.organization.findMany({
      where: { id: { in: memberships.map((m) => m.organizationId) } },
      orderBy: { name: "asc" },
    });
  }

  /** Tenant-checked: `null` for both "doesn't exist" and "exists but you're not a member," matching the platform-wide IDOR-safety convention. */
  async getOrganizationDetail(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationDetail | null> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    if (!canAccessOrganization(userId, organizationId, memberships)) return null;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) return null;

    const memberships_ = await prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      ...organization,
      members: memberships_.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        joinedAt: m.createdAt,
      })),
    };
  }

  /**
   * Real spend, not an estimate presented as exact — sums the same
   * `AIUsage.estimatedCostUsd` rows `AIUsage` was already designed to
   * record, for the current calendar month, against the actually
   * configured budgets. Returns `enabled: false` (no spend figure at all)
   * when no AI provider is configured, rather than showing a misleading
   * "$0.00 of $0.00".
   */
  async getAiUsageSummary(userId: string, organizationId: string): Promise<AiUsageSummary | null> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    if (!canAccessOrganization(userId, organizationId, memberships)) return null;

    if (!this.config.features.aiEnabled) {
      return {
        enabled: false,
        monthlyBudgetUsd: 0,
        perScanBudgetUsd: 0,
        spentThisMonthUsd: 0,
      };
    }

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const usage = await prisma.aIUsage.aggregate({
      where: { organizationId, createdAt: { gte: startOfMonth } },
      _sum: { estimatedCostUsd: true },
    });

    return {
      enabled: true,
      monthlyBudgetUsd: this.config.env.AI_MONTHLY_BUDGET_USD,
      perScanBudgetUsd: this.config.env.AI_PER_SCAN_BUDGET_USD,
      spentThisMonthUsd: usage._sum.estimatedCostUsd ?? 0,
    };
  }
}
