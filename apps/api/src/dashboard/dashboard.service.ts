import { Injectable } from "@nestjs/common";
import { prisma, type Finding as PrismaFinding } from "@sayan-sentinel/database";
import { computeSecurityScore, type ScoredFindingInput } from "@sayan-sentinel/findings";
import type { ConfidenceLevel, FindingStatus, Severity } from "@sayan-sentinel/shared";
import { MembershipLookupService } from "../repositories/membership-lookup.service";

const SEVERITY_MAP: Record<PrismaFinding["severity"], Severity> = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  INFO: "info",
};

const CONFIDENCE_MAP: Record<PrismaFinding["confidence"], ConfidenceLevel> = {
  CONFIRMED: "confirmed",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

const STATUS_MAP: Record<PrismaFinding["status"], FindingStatus> = {
  OPEN: "open",
  CONFIRMED: "confirmed",
  LIKELY: "likely",
  NEEDS_REVIEW: "needs_review",
  FALSE_POSITIVE: "false_positive",
  RESOLVED: "resolved",
  ACCEPTED_RISK: "accepted_risk",
};

export interface DashboardSummary {
  repositoryCount: number;
  scanCount: number;
  securityScore: number;
  openFindingCount: number;
  openFindingsBySeverity: Record<Severity, number>;
}

@Injectable()
export class DashboardService {
  constructor(private readonly membershipLookup: MembershipLookupService) {}

  async getSummaryForUser(userId: string): Promise<DashboardSummary> {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    const organizationIds = memberships.map((m) => m.organizationId);

    if (organizationIds.length === 0) {
      return {
        repositoryCount: 0,
        scanCount: 0,
        securityScore: 100,
        openFindingCount: 0,
        openFindingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      };
    }

    const orgFilter = { organizationId: { in: organizationIds } };

    const [repositoryCount, scanCount, findings] = await Promise.all([
      prisma.repository.count({ where: orgFilter }),
      prisma.scan.count({ where: { repository: orgFilter } }),
      prisma.finding.findMany({ where: { repository: orgFilter } }),
    ]);

    const scoredFindings: ScoredFindingInput[] = findings.map((f) => ({
      severity: SEVERITY_MAP[f.severity],
      confidence: CONFIDENCE_MAP[f.confidence],
      status: STATUS_MAP[f.status],
      firstSeenAt: f.createdAt,
    }));

    const score = computeSecurityScore(scoredFindings);

    const openFindingsBySeverity: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const entry of score.breakdown) {
      openFindingsBySeverity[entry.severity] = entry.count;
    }

    return {
      repositoryCount,
      scanCount,
      securityScore: score.score,
      openFindingCount: score.openFindingCount,
      openFindingsBySeverity,
    };
  }
}
