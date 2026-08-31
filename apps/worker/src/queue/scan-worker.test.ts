import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { FullStackScanResult } from "../pipeline/full-stack-scan-types";
import type { ScanJobData } from "./queue-names";
import { processScanJob } from "./scan-worker";

const { runFullStackScanPipelineMock, persistScanResultMock, buildCheckRunSummaryMock } =
  vi.hoisted(() => ({
    runFullStackScanPipelineMock: vi.fn(),
    persistScanResultMock: vi.fn(),
    buildCheckRunSummaryMock: vi.fn(),
  }));

vi.mock("../pipeline/run-full-stack-scan-pipeline", () => ({
  runFullStackScanPipeline: runFullStackScanPipelineMock,
}));
vi.mock("../persistence/persist-scan-result", () => ({
  persistScanResult: persistScanResultMock,
}));
vi.mock("../github/build-check-run-summary", () => ({
  buildCheckRunSummary: buildCheckRunSummaryMock,
}));

function baseJobData(overrides: Partial<ScanJobData> = {}): ScanJobData {
  return {
    repositoryUrl: "https://github.com/acme/widgets.git",
    commitSha: "abc123",
    workspaceDir: "/tmp/whatever",
    scanId: "scan-1",
    localLabMode: false,
    ...overrides,
  };
}

function fakeResult(): FullStackScanResult {
  return {
    code: {
      commitSha: "abc123",
      graph: { nodes: [], edges: [] },
      scannerRuns: [],
      correlatedFindings: [],
      securityScore: { score: 100, breakdown: [], openFindingCount: 0 },
      policyResult: { passed: true, violations: [] },
      durationMs: 10,
    },
    correlatedFindings: [],
    securityScore: { score: 100, breakdown: [], openFindingCount: 0 },
    durationMs: 10,
  };
}

describe("processScanJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runFullStackScanPipelineMock.mockResolvedValue(fakeResult());
    buildCheckRunSummaryMock.mockReturnValue({
      headSha: "abc123",
      name: "Sentinel Security Scan",
      status: "completed",
      conclusion: "success",
    });
  });

  it("does not create a Check Run when the job carries no github context", async () => {
    const createCheckRun = vi.fn();
    const job = { data: baseJobData() } as Job<ScanJobData>;

    await processScanJob(job, {} as never, { createCheckRun } as never);

    expect(createCheckRun).not.toHaveBeenCalled();
  });

  it("does not create a Check Run when the job has github context but no client is configured (app not set up)", async () => {
    const job = {
      data: baseJobData({ github: { installationId: 1, owner: "acme", repo: "widgets" } }),
    } as Job<ScanJobData>;

    // Should not throw despite a null client, and there is nothing to assert
    // a call on — the absence of a client must be a silent no-op.
    const result = await processScanJob(job, {} as never, null);

    expect(result).toBeDefined();
  });

  it("creates a Check Run with the job's installation/owner/repo when both github context and a configured client are present", async () => {
    const createCheckRun = vi.fn().mockResolvedValue(undefined);
    const job = {
      data: baseJobData({ github: { installationId: 42, owner: "acme", repo: "widgets" } }),
    } as Job<ScanJobData>;

    await processScanJob(job, {} as never, { createCheckRun } as never);

    expect(createCheckRun).toHaveBeenCalledTimes(1);
    expect(createCheckRun).toHaveBeenCalledWith(
      42,
      "acme",
      "widgets",
      expect.objectContaining({ headSha: "abc123" }),
    );
  });

  it("does not let a Check Run API failure fail the scan job", async () => {
    const createCheckRun = vi.fn().mockRejectedValue(new Error("GitHub API down"));
    const job = {
      data: baseJobData({ github: { installationId: 1, owner: "acme", repo: "widgets" } }),
    } as Job<ScanJobData>;

    await expect(
      processScanJob(job, {} as never, { createCheckRun } as never),
    ).resolves.toBeDefined();
  });

  it("still persists when repositoryId is present, independent of github reporting", async () => {
    const job = {
      data: baseJobData({ repositoryId: "repo-1", trigger: "PUSH" }),
    } as Job<ScanJobData>;

    await processScanJob(job, {} as never, null);

    expect(persistScanResultMock).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryId: "repo-1", trigger: "PUSH" }),
    );
  });
});
