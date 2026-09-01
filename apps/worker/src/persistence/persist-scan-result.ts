import { Prisma, prisma } from "@sayan-sentinel/database";
import type { CorrelatedFinding } from "@sayan-sentinel/findings";
import type { ConfidenceLevel, FindingSource, Severity } from "@sayan-sentinel/shared";
import type { FullStackScanResult } from "../pipeline/full-stack-scan-types";

const SEVERITY_MAP: Record<Severity, "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

const CONFIDENCE_MAP: Record<ConfidenceLevel, "CONFIRMED" | "HIGH" | "MEDIUM" | "LOW"> = {
  confirmed: "CONFIRMED",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

const SOURCE_MAP: Record<
  FindingSource,
  | "STATIC_ANALYSIS"
  | "SECRET_DETECTION"
  | "DEPENDENCY_ANALYSIS"
  | "CODE_INTELLIGENCE"
  | "RULES_ENGINE"
  | "WEB_SECURITY"
  | "API_SECURITY"
  | "AI_REVIEW"
  | "DYNAMIC_VALIDATION"
> = {
  static_analysis: "STATIC_ANALYSIS",
  secret_detection: "SECRET_DETECTION",
  dependency_analysis: "DEPENDENCY_ANALYSIS",
  code_intelligence: "CODE_INTELLIGENCE",
  rules_engine: "RULES_ENGINE",
  web_security: "WEB_SECURITY",
  api_security: "API_SECURITY",
  ai_review: "AI_REVIEW",
  dynamic_validation: "DYNAMIC_VALIDATION",
};

export interface PersistScanResultInput {
  repositoryId: string;
  commitSha: string;
  trigger: "MANUAL" | "PUSH" | "PULL_REQUEST" | "SCHEDULED";
  result: FullStackScanResult;
}

export interface PersistScanResultOutput {
  scanId: string;
}

/**
 * Writes a completed scan's results to the database: one `Scan` row, and
 * one `Finding` row per correlated finding — upserted by the existing
 * `(repositoryId, fingerprint)` unique constraint so the same underlying
 * issue re-detected across scans updates its `lastSeenScanId` rather than
 * duplicating. This is the first code in the repository to actually write
 * to these tables — `apps/api`'s dashboard has read from `prisma.scan`/
 * `prisma.finding` since an earlier phase, but nothing populated them
 * until now (documented in docs/dashboard-persistence.md).
 *
 * **A human's triage decision survives a re-scan**: `status` is set to
 * `OPEN` only when a `Finding` row is first created; an update never
 * touches `status`, so a finding a human already marked
 * `false_positive`/`resolved`/`accepted_risk` stays that way even though
 * the detector still reports it every scan. Severity/confidence/
 * description *do* refresh on every scan, since those are detector-
 * computed properties, not human judgments.
 *
 * **Evidence rows are replaced, not accumulated**: a finding's old
 * `FindingEvidence` rows are deleted before this scan's evidence is
 * inserted, so the evidence list reflects the latest scan rather than
 * growing an unbounded history of every past detection.
 */
export async function persistScanResult(
  input: PersistScanResultInput,
): Promise<PersistScanResultOutput> {
  const scan = await prisma.scan.create({
    data: {
      repositoryId: input.repositoryId,
      commitSha: input.commitSha,
      trigger: input.trigger,
      status: "COMPLETED",
      startedAt: new Date(Date.now() - input.result.durationMs),
      completedAt: new Date(),
      durationMs: input.result.durationMs,
      securityScore: input.result.securityScore.score,
    },
  });

  for (const finding of input.result.correlatedFindings) {
    await upsertFinding(input.repositoryId, scan.id, finding);
  }

  await persistGraph(scan.id, input.result.code.graph);
  await persistAttackSurface(scan.id, input.result.web, input.result.routeCorrelation);

  return { scanId: scan.id };
}

/**
 * `web` is present only for a Full Stack Scan against a verified target;
 * `routeCorrelation` is present whenever source routes were extractable,
 * even code-only. Both are independent optionals — persisting one never
 * implies the other is present.
 */
async function persistAttackSurface(
  scanId: string,
  web: FullStackScanResult["web"],
  routeCorrelation: FullStackScanResult["routeCorrelation"],
): Promise<void> {
  if (web && web.crawl.pages.length > 0) {
    await prisma.attackSurfacePage.createMany({
      data: web.crawl.pages.map((page) => ({
        scanId,
        url: page.url,
        depth: page.depth,
        status: page.status,
        linkCount: page.links.length,
        scriptCount: page.scripts.length,
        forms: page.forms as unknown as Prisma.InputJsonValue,
      })),
    });
  }

  if (routeCorrelation) {
    await prisma.routeCorrelationSummary.create({
      data: {
        scanId,
        runtimeRequestCount: routeCorrelation.runtimeRequestCount,
        matched: routeCorrelation.matched as unknown as Prisma.InputJsonValue,
        unmatchedRuntimeRequests:
          routeCorrelation.unmatchedRuntimeRequests as unknown as Prisma.InputJsonValue,
        unmatchedSourceRoutes:
          routeCorrelation.unmatchedSourceRoutes as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

/**
 * Each scan's graph is a fresh, independent snapshot tied to `scanId` —
 * unlike findings, nothing is upserted/deduplicated across scans, so a
 * bulk `createMany` is sufficient and avoids an await-per-node/edge loop.
 */
async function persistGraph(
  scanId: string,
  graph: FullStackScanResult["code"]["graph"],
): Promise<void> {
  if (graph.nodes.length > 0) {
    await prisma.graphNode.createMany({
      data: graph.nodes.map((node) => ({
        scanId,
        externalId: node.id,
        kind: node.kind,
        filePath: node.filePath,
        name: node.name,
        lineStart: node.lineStart,
        lineEnd: node.lineEnd,
        metadata: node.metadata as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  if (graph.edges.length > 0) {
    await prisma.graphEdge.createMany({
      data: graph.edges.map((edge) => ({
        scanId,
        kind: edge.kind,
        fromNodeExternalId: edge.fromNodeId,
        toNodeExternalId: edge.toNodeId,
        metadata: edge.metadata as Prisma.InputJsonValue | undefined,
      })),
    });
  }
}

async function upsertFinding(
  repositoryId: string,
  scanId: string,
  finding: CorrelatedFinding,
): Promise<void> {
  const findingRow = await prisma.finding.upsert({
    where: { repositoryId_fingerprint: { repositoryId, fingerprint: finding.fingerprint } },
    create: {
      repositoryId,
      fingerprint: finding.fingerprint,
      category: finding.category,
      cwe: finding.cwe,
      owaspCategory: finding.owaspCategory,
      title: finding.title,
      description: finding.description,
      severity: SEVERITY_MAP[finding.severity],
      confidence: CONFIDENCE_MAP[finding.confidence],
      primarySource: SOURCE_MAP[finding.primarySource],
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      symbol: finding.symbol,
      remediation: finding.remediation,
      firstSeenScanId: scanId,
      lastSeenScanId: scanId,
    },
    update: {
      severity: SEVERITY_MAP[finding.severity],
      confidence: CONFIDENCE_MAP[finding.confidence],
      description: finding.description,
      remediation: finding.remediation,
      lastSeenScanId: scanId,
    },
  });

  await prisma.findingEvidence.deleteMany({ where: { findingId: findingRow.id } });
  for (const evidence of finding.evidence) {
    await prisma.findingEvidence.create({
      data: {
        findingId: findingRow.id,
        source: SOURCE_MAP[evidence.source],
        scanner: evidence.scanner,
        detail: evidence.detail as Prisma.InputJsonValue,
      },
    });
  }
}
