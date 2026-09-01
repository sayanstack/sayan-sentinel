import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@sayan-sentinel/database";
import type { CorrelatedFinding } from "@sayan-sentinel/findings";
import { persistScanResult } from "./persist-scan-result";
import type { FullStackScanResult } from "../pipeline/full-stack-scan-types";

vi.mock("@sayan-sentinel/database", () => ({
  prisma: {
    scan: { create: vi.fn() },
    finding: { upsert: vi.fn() },
    findingEvidence: { deleteMany: vi.fn(), create: vi.fn() },
    graphNode: { createMany: vi.fn() },
    graphEdge: { createMany: vi.fn() },
    attackSurfacePage: { createMany: vi.fn() },
    routeCorrelationSummary: { create: vi.fn() },
  },
  Prisma: {},
}));

function finding(overrides: Partial<CorrelatedFinding> = {}): CorrelatedFinding {
  return {
    fingerprint: "fp-1",
    category: "SENTINEL-AUTHZ-001",
    title: "Potential BOLA",
    description: "desc",
    severity: "high",
    confidence: "high",
    primarySource: "rules_engine",
    filePath: "src/a.ts",
    lineStart: 10,
    evidence: [{ source: "rules_engine", scanner: "sentinel-rules-engine", detail: {} }],
    detectedBy: ["rules_engine"],
    ...overrides,
  };
}

function minimalResult(
  findings: CorrelatedFinding[],
  overrides: {
    graph?: FullStackScanResult["code"]["graph"];
    web?: FullStackScanResult["web"];
    routeCorrelation?: FullStackScanResult["routeCorrelation"];
  } = {},
): FullStackScanResult {
  return {
    code: {
      commitSha: "abc123",
      graph: overrides.graph ?? { nodes: [], edges: [] },
      scannerRuns: [],
      correlatedFindings: findings,
      securityScore: { score: 80, breakdown: [], openFindingCount: findings.length },
      policyResult: { passed: true, violations: [] },
      durationMs: 100,
    },
    web: overrides.web,
    routeCorrelation: overrides.routeCorrelation,
    correlatedFindings: findings,
    securityScore: { score: 80, breakdown: [], openFindingCount: findings.length },
    durationMs: 150,
  };
}

describe("persistScanResult", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a Scan row with the computed security score and duration", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-1" });
    (prisma.finding.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "finding-1" });

    const result = await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "abc123",
      trigger: "MANUAL",
      result: minimalResult([]),
    });

    expect(result.scanId).toBe("scan-1");
    expect(prisma.scan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repositoryId: "repo-1",
          commitSha: "abc123",
          trigger: "MANUAL",
          status: "COMPLETED",
          securityScore: 80,
          durationMs: 150,
        }),
      }),
    );
  });

  it("upserts a Finding row keyed by repositoryId+fingerprint, mapping severity/confidence/source to the Prisma enums", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-1" });
    (prisma.finding.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "finding-1" });

    await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "abc123",
      trigger: "MANUAL",
      result: minimalResult([finding()]),
    });

    expect(prisma.finding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { repositoryId_fingerprint: { repositoryId: "repo-1", fingerprint: "fp-1" } },
        create: expect.objectContaining({
          severity: "HIGH",
          confidence: "HIGH",
          primarySource: "RULES_ENGINE",
          firstSeenScanId: "scan-1",
          lastSeenScanId: "scan-1",
        }),
        update: expect.objectContaining({
          severity: "HIGH",
          confidence: "HIGH",
          lastSeenScanId: "scan-1",
        }),
      }),
    );
  });

  it("never sets status in the update branch, so a human's triage decision survives a re-scan", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-2" });
    (prisma.finding.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "finding-1" });

    await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "def456",
      trigger: "PUSH",
      result: minimalResult([finding()]),
    });

    const call = (prisma.finding.upsert as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.update).not.toHaveProperty("status");
  });

  it("replaces old evidence rows rather than accumulating them across scans", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-1" });
    (prisma.finding.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "finding-1" });

    await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "abc123",
      trigger: "MANUAL",
      result: minimalResult([finding()]),
    });

    expect(prisma.findingEvidence.deleteMany).toHaveBeenCalledWith({
      where: { findingId: "finding-1" },
    });
    expect(prisma.findingEvidence.create).toHaveBeenCalledTimes(1);
  });

  it("persists every finding when multiple are present", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-1" });
    (prisma.finding.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "finding-x" });

    await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "abc123",
      trigger: "MANUAL",
      result: minimalResult([finding({ fingerprint: "fp-1" }), finding({ fingerprint: "fp-2" })]),
    });

    expect(prisma.finding.upsert).toHaveBeenCalledTimes(2);
  });

  it("bulk-persists the scan's graph nodes and edges tied to the new scan id", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-1" });

    await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "abc123",
      trigger: "MANUAL",
      result: minimalResult([], {
        graph: {
          nodes: [
            {
              id: "node-1",
              kind: "route",
              filePath: "src/routes/users.ts",
              name: "GET /users",
              lineStart: 1,
              lineEnd: 5,
            },
          ],
          edges: [{ id: "edge-1", kind: "CALLS", fromNodeId: "node-1", toNodeId: "node-2" }],
        },
      }),
    });

    expect(prisma.graphNode.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          scanId: "scan-1",
          externalId: "node-1",
          kind: "route",
          filePath: "src/routes/users.ts",
          name: "GET /users",
        }),
      ],
    });
    expect(prisma.graphEdge.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          scanId: "scan-1",
          kind: "CALLS",
          fromNodeExternalId: "node-1",
          toNodeExternalId: "node-2",
        }),
      ],
    });
  });

  it("skips the createMany calls entirely for an empty graph, rather than calling them with an empty array", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-1" });

    await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "abc123",
      trigger: "MANUAL",
      result: minimalResult([]),
    });

    expect(prisma.graphNode.createMany).not.toHaveBeenCalled();
    expect(prisma.graphEdge.createMany).not.toHaveBeenCalled();
  });

  it("persists crawled pages when a web target was scanned", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-1" });

    await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "abc123",
      trigger: "MANUAL",
      result: minimalResult([], {
        web: {
          crawl: {
            startUrl: "https://example.com/",
            pages: [
              {
                url: "https://example.com/login",
                depth: 0,
                status: 200,
                links: ["https://example.com/"],
                scripts: ["https://example.com/app.js"],
                forms: [{ method: "post", action: "/login", fieldNames: ["email", "password"] }],
              },
            ],
            visitedCount: 1,
            skippedExternal: [],
            truncated: false,
            errors: [],
          },
          findings: [],
        },
      }),
    });

    expect(prisma.attackSurfacePage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          scanId: "scan-1",
          url: "https://example.com/login",
          depth: 0,
          status: 200,
          linkCount: 1,
          scriptCount: 1,
          forms: [{ method: "post", action: "/login", fieldNames: ["email", "password"] }],
        }),
      ],
    });
  });

  it("does not touch attackSurfacePage when there is no web target", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-1" });

    await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "abc123",
      trigger: "MANUAL",
      result: minimalResult([]),
    });

    expect(prisma.attackSurfacePage.createMany).not.toHaveBeenCalled();
  });

  it("persists a route correlation summary when source routes were extracted", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-1" });

    await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "abc123",
      trigger: "MANUAL",
      result: minimalResult([], {
        routeCorrelation: {
          sourceRoutes: [],
          runtimeRequestCount: 3,
          matched: [],
          unmatchedRuntimeRequests: [{ method: "GET", path: "/unknown" }],
          unmatchedSourceRoutes: [],
        },
      }),
    });

    expect(prisma.routeCorrelationSummary.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scanId: "scan-1",
        runtimeRequestCount: 3,
        unmatchedRuntimeRequests: [{ method: "GET", path: "/unknown" }],
      }),
    });
  });

  it("does not touch routeCorrelationSummary when routeCorrelation wasn't computed", async () => {
    (prisma.scan.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "scan-1" });

    await persistScanResult({
      repositoryId: "repo-1",
      commitSha: "abc123",
      trigger: "MANUAL",
      result: minimalResult([]),
    });

    expect(prisma.routeCorrelationSummary.create).not.toHaveBeenCalled();
  });
});
