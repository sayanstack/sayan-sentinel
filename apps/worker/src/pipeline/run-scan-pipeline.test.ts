import type { AICompletionRequest, AICompletionResponse, AIProvider } from "@sayan-sentinel/ai-engine";
import type { CodeGraph } from "@sayan-sentinel/code-intelligence";
import type { FindingDraft } from "@sayan-sentinel/findings";
import { failIfCriticalExists } from "@sayan-sentinel/policy-engine";
import type { ScanOptions, ScanOutcome, ScannerAdapter, ScannerAvailability } from "@sayan-sentinel/security-engine";
import { describe, expect, it } from "vitest";
import { runScanPipeline } from "./run-scan-pipeline";
import type { ScanPipelineDependencies, ScanPipelineInput } from "./types";

const EMPTY_GRAPH: CodeGraph = { nodes: [], edges: [] };

function draft(overrides: Partial<FindingDraft> = {}): FindingDraft {
  return {
    fingerprint: "fp",
    category: "rule",
    title: "Finding",
    description: "desc",
    severity: "medium",
    confidence: "medium",
    primarySource: "static_analysis",
    filePath: "src/a.ts",
    lineStart: 1,
    evidence: [{ source: "static_analysis", scanner: "fake", detail: {} }],
    ...overrides,
  };
}

class FakeScanner implements ScannerAdapter {
  constructor(
    public readonly name: string,
    private readonly availability: ScannerAvailability,
    private readonly outcome?: ScanOutcome,
  ) {}
  checkAvailability(): Promise<ScannerAvailability> {
    return Promise.resolve(this.availability);
  }
  scan(_targetDir: string, _options?: ScanOptions): Promise<ScanOutcome> {
    return Promise.resolve(this.outcome ?? { status: "completed", findings: [], durationMs: 1, rawFindingCount: 0 });
  }
}

class FakeAIProvider implements AIProvider {
  readonly name = "fake";
  constructor(private readonly respond: (req: AICompletionRequest) => AICompletionResponse | Error) {}
  complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const result = this.respond(request);
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  }
}

const VALID_ANALYSIS_JSON = JSON.stringify({
  isLikelyFalsePositive: false,
  confidenceAdjustment: "unchanged",
  explanation: "looks real",
});

function baseInput(): ScanPipelineInput {
  return {
    repositoryUrl: "https://example.invalid/repo.git",
    commitSha: "abc123",
    workspaceDir: "/tmp/fake-workspace",
    scanId: "scan-1",
    localLabMode: false,
  };
}

function baseDeps(overrides: Partial<ScanPipelineDependencies> = {}): ScanPipelineDependencies {
  return {
    cloneRepository: async ({ destinationDir, commitSha }) => ({ destinationDir, commitSha }),
    walkRepositoryFiles: async () => ({ files: [{ relativePath: "src/a.ts" }] }),
    buildCodeGraph: () => EMPTY_GRAPH,
    scanners: [],
    aiProvider: null,
    policyRules: [],
    ...overrides,
  };
}

describe("runScanPipeline", () => {
  it("runs end to end with no scanners and no AI, producing a perfect score and passing policy", async () => {
    const result = await runScanPipeline(baseInput(), baseDeps());

    expect(result.commitSha).toBe("abc123");
    expect(result.correlatedFindings).toEqual([]);
    expect(result.securityScore.score).toBe(100);
    expect(result.policyResult.passed).toBe(true);
    expect(result.aiAnalysisSkippedReason).toBe(
      "AI provider unavailable — deterministic analysis completed successfully.",
    );
  });

  it("collects findings from an available scanner and records it as completed", async () => {
    const scanner = new FakeScanner(
      "fake-scanner",
      { available: true, version: "1.0" },
      { status: "completed", findings: [draft()], durationMs: 5, rawFindingCount: 1 },
    );

    const result = await runScanPipeline(baseInput(), baseDeps({ scanners: [scanner] }));

    expect(result.correlatedFindings).toHaveLength(1);
    expect(result.scannerRuns).toEqual([
      { name: "fake-scanner", availability: { available: true, version: "1.0" }, status: "completed", rawFindingCount: 1 },
    ]);
  });

  it("records an unavailable scanner honestly and still completes the scan using the others", async () => {
    const unavailable = new FakeScanner("missing-tool", { available: false, reason: "not installed" });
    const available = new FakeScanner(
      "present-tool",
      { available: true },
      { status: "completed", findings: [draft()], durationMs: 1, rawFindingCount: 1 },
    );

    const result = await runScanPipeline(baseInput(), baseDeps({ scanners: [unavailable, available] }));

    expect(result.scannerRuns.find((r) => r.name === "missing-tool")?.status).toBe("unavailable");
    expect(result.scannerRuns.find((r) => r.name === "present-tool")?.status).toBe("completed");
    expect(result.correlatedFindings).toHaveLength(1);
  });

  it("records a failed scanner without aborting the rest of the pipeline", async () => {
    const failing = new FakeScanner(
      "broken-tool",
      { available: true },
      { status: "failed", error: "crashed", durationMs: 1 },
    );

    const result = await runScanPipeline(baseInput(), baseDeps({ scanners: [failing] }));

    expect(result.scannerRuns[0]).toMatchObject({ name: "broken-tool", status: "failed", error: "crashed" });
    expect(result.policyResult.passed).toBe(true);
  });

  it("fails the configured policy when a critical finding is found", async () => {
    const scanner = new FakeScanner(
      "fake-scanner",
      { available: true },
      { status: "completed", findings: [draft({ severity: "critical" })], durationMs: 1, rawFindingCount: 1 },
    );

    const result = await runScanPipeline(
      baseInput(),
      baseDeps({ scanners: [scanner], policyRules: [failIfCriticalExists()] }),
    );

    expect(result.policyResult.passed).toBe(false);
    expect(result.securityScore.score).toBeLessThan(100);
  });

  it("skips AI analysis with a clear reason when a provider is configured but no model is given", async () => {
    const provider = new FakeAIProvider(() => ({ text: VALID_ANALYSIS_JSON, usage: { inputTokens: 1, outputTokens: 1 }, model: "x" }));

    const result = await runScanPipeline(baseInput(), baseDeps({ aiProvider: provider }));

    expect(result.aiAnalysisSkippedReason).toContain("no model specified");
  });

  it("completes AI analysis silently (no skip reason) when the provider succeeds", async () => {
    const scanner = new FakeScanner(
      "fake-scanner",
      { available: true },
      { status: "completed", findings: [draft({ severity: "high" })], durationMs: 1, rawFindingCount: 1 },
    );
    const provider = new FakeAIProvider(() => ({
      text: VALID_ANALYSIS_JSON,
      usage: { inputTokens: 1, outputTokens: 1 },
      model: "test-model",
    }));

    const result = await runScanPipeline(
      baseInput(),
      baseDeps({ scanners: [scanner], aiProvider: provider, aiModel: "test-model" }),
    );

    expect(result.aiAnalysisSkippedReason).toBeUndefined();
  });

  it("never fails the whole scan when the AI call throws — deterministic results are still returned", async () => {
    const scanner = new FakeScanner(
      "fake-scanner",
      { available: true },
      { status: "completed", findings: [draft({ severity: "critical" })], durationMs: 1, rawFindingCount: 1 },
    );
    const provider = new FakeAIProvider(() => new Error("provider unreachable"));

    const result = await runScanPipeline(
      baseInput(),
      baseDeps({
        scanners: [scanner],
        aiProvider: provider,
        aiModel: "test-model",
        policyRules: [failIfCriticalExists()],
      }),
    );

    expect(result.aiAnalysisSkippedReason).toContain("provider unreachable");
    // Deterministic results computed before the AI step remain intact and correct.
    expect(result.correlatedFindings).toHaveLength(1);
    expect(result.policyResult.passed).toBe(false);
  });
});
