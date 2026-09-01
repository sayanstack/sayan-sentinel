import { Injectable } from "@nestjs/common";
import { canAccessOrganization } from "@sayan-sentinel/auth";
import {
  prisma,
  type AttackSurfacePage,
  type GraphEdge,
  type GraphNode,
  type RouteCorrelationSummary,
} from "@sayan-sentinel/database";
import { MembershipLookupService } from "./membership-lookup.service";

export interface RepositoryGraph {
  scanId: string | null;
  scanCreatedAt: Date | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RepositoryAttackSurface {
  scanId: string | null;
  scanCreatedAt: Date | null;
  pages: AttackSurfacePage[];
  routeCorrelation: RouteCorrelationSummary | null;
}

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

  /** Every repository owned by any organization `userId` is a member of — never a cross-tenant list. */
  async listRepositoriesForUser(userId: string) {
    const memberships = await this.membershipLookup.getMembershipsForUser(userId);
    const organizationIds = memberships.map((m) => m.organizationId);
    if (organizationIds.length === 0) return [];

    return prisma.repository.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * The Application Graph for a repository's most recent completed scan.
   * Each scan's graph is an independent snapshot (`GraphNode`/`GraphEdge`
   * are tied to `scanId`, never upserted/merged across scans) — this
   * always reflects the single latest scan, not an accumulated history.
   * Returns `null` for the same "missing or cross-tenant" reasons as
   * `getRepositoryForUser`; returns an empty graph (not `null`) when the
   * repository is real and accessible but has never completed a scan.
   */
  async getLatestGraphForUser(
    userId: string,
    repositoryId: string,
  ): Promise<RepositoryGraph | null> {
    const repository = await this.getRepositoryForUser(userId, repositoryId);
    if (!repository) return null;

    const latestScan = await this.findLatestCompletedScan(repositoryId);
    if (!latestScan) {
      return { scanId: null, scanCreatedAt: null, nodes: [], edges: [] };
    }

    const [nodes, edges] = await Promise.all([
      prisma.graphNode.findMany({ where: { scanId: latestScan.id } }),
      prisma.graphEdge.findMany({ where: { scanId: latestScan.id } }),
    ]);

    return { scanId: latestScan.id, scanCreatedAt: latestScan.createdAt, nodes, edges };
  }

  /**
   * The Attack Surface (crawled pages + route correlation) for a
   * repository's most recent completed scan — same scan-scoping and
   * "empty, not null, once accessible" behavior as `getLatestGraphForUser`.
   * `pages`/`routeCorrelation` are independent: a code-only scan (no
   * verified web target) has `pages: []` but may still have a real
   * `routeCorrelation` from its extracted source routes.
   */
  async getLatestAttackSurfaceForUser(
    userId: string,
    repositoryId: string,
  ): Promise<RepositoryAttackSurface | null> {
    const repository = await this.getRepositoryForUser(userId, repositoryId);
    if (!repository) return null;

    const latestScan = await this.findLatestCompletedScan(repositoryId);
    if (!latestScan) {
      return { scanId: null, scanCreatedAt: null, pages: [], routeCorrelation: null };
    }

    const [pages, routeCorrelation] = await Promise.all([
      prisma.attackSurfacePage.findMany({ where: { scanId: latestScan.id } }),
      prisma.routeCorrelationSummary.findUnique({ where: { scanId: latestScan.id } }),
    ]);

    return { scanId: latestScan.id, scanCreatedAt: latestScan.createdAt, pages, routeCorrelation };
  }

  private findLatestCompletedScan(repositoryId: string) {
    return prisma.scan.findFirst({
      where: { repositoryId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });
  }
}
