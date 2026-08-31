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

function minimalResult(findings: CorrelatedFinding[]): FullStackScanResult {
  return {
    code: {
      commitSha: "abc123",
      graph: { nodes: [], edges: [] },
      scannerRuns: [],
      correlatedFindings: findings,
      securityScore: { score: 80, breakdown: [], openFindingCount: findings.length },
      policyResult: { passed: true, violations: [] },
      durationMs: 100,
    },
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
});
