import {
  buildFindingAnalysisPrompt,
  completeStructured,
  findingAnalysisSchema,
} from "@sayan-sentinel/ai-engine";
import {
  computeSecurityScore,
  correlateFindings,
  type FindingDraft,
} from "@sayan-sentinel/findings";
import { evaluatePolicy } from "@sayan-sentinel/policy-engine";
import type {
  ScanPipelineDependencies,
  ScanPipelineInput,
  ScanPipelineResult,
  ScannerRunSummary,
} from "./types";

const MAX_AI_ANALYZED_FINDINGS = 5;
const SEVERITY_RANK: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

/**
 * Orchestrates one full deterministic (+ optional AI) scan: clone → walk →
 * build code graph → run every configured scanner → correlate → score →
 * evaluate policy → (optionally) AI-analyze the top findings. Every
 * dependency is injected so this composition can be tested without a real
 * git binary, real scanners, a real AI provider, or a queue — those are
 * each already tested in their own packages; this test proves they wire
 * together correctly.
 *
 * A missing/unavailable scanner or a failed AI call never aborts the
 * whole scan (Section 43) — deterministic results already computed stay
 * valid regardless of what else didn't run.
 */
export async function runScanPipeline(
  input: ScanPipelineInput,
  deps: ScanPipelineDependencies,
): Promise<ScanPipelineResult> {
  const startedAt = Date.now();
  const now = deps.now ?? new Date();

  const clone = await deps.cloneRepository({
    repositoryUrl: input.repositoryUrl,
    commitSha: input.commitSha,
    branch: input.branch,
    destinationDir: input.workspaceDir,
  });

  const walked = await deps.walkRepositoryFiles(clone.destinationDir);
  const filePaths = walked.files.map((f) => f.relativePath);
  const graph = deps.buildCodeGraph({ rootDir: clone.destinationDir, filePaths });

  const { allDrafts, scannerRuns } = await runScanners(deps.scanners, clone.destinationDir);
  const correlatedFindings = correlateFindings(allDrafts);

  const securityScore = computeSecurityScore(
    correlatedFindings.map((f) => ({
      severity: f.severity,
      confidence: f.confidence,
      // No findings-persistence layer is wired into the worker yet, so a
      // fresh scan has no history to compare against — every finding is
      // treated as freshly "open" as of now. This is a documented
      // simplification (age-based scoring has nothing to measure age
      // against yet), not a fabricated status.
      status: "open",
      firstSeenAt: now,
    })),
    now,
  );

  const policyResult = evaluatePolicy(deps.policyRules, {
    findings: correlatedFindings.map((f) => ({
      severity: f.severity,
      confidence: f.confidence,
      status: "open",
      primarySource: f.primarySource,
      isNew: true,
    })),
  });

  const aiAnalysisSkippedReason = await runAiAnalysis(correlatedFindings, deps);

  return {
    commitSha: clone.commitSha,
    graph,
    scannerRuns,
    correlatedFindings,
    securityScore,
    policyResult,
    aiAnalysisSkippedReason,
    durationMs: Date.now() - startedAt,
  };
}

async function runScanners(
  scanners: ScanPipelineDependencies["scanners"],
  targetDir: string,
): Promise<{ allDrafts: FindingDraft[]; scannerRuns: ScannerRunSummary[] }> {
  const allDrafts: FindingDraft[] = [];
  const scannerRuns: ScannerRunSummary[] = [];

  for (const scanner of scanners) {
    const availability = await scanner.checkAvailability();
    if (!availability.available) {
      scannerRuns.push({
        name: scanner.name,
        availability,
        status: "unavailable",
        rawFindingCount: 0,
      });
      continue;
    }

    const outcome = await scanner.scan(targetDir);
    if (outcome.status === "completed") {
      allDrafts.push(...outcome.findings);
      scannerRuns.push({
        name: scanner.name,
        availability,
        status: "completed",
        rawFindingCount: outcome.rawFindingCount,
      });
    } else if (outcome.status === "unavailable") {
      scannerRuns.push({
        name: scanner.name,
        availability,
        status: "unavailable",
        rawFindingCount: 0,
      });
    } else {
      scannerRuns.push({
        name: scanner.name,
        availability,
        status: "failed",
        rawFindingCount: 0,
        error: outcome.error,
      });
    }
  }

  return { allDrafts, scannerRuns };
}

async function runAiAnalysis(
  correlatedFindings: ScanPipelineResult["correlatedFindings"],
  deps: ScanPipelineDependencies,
): Promise<string | undefined> {
  if (!deps.aiProvider) {
    return "AI provider unavailable — deterministic analysis completed successfully.";
  }
  if (!deps.aiModel) {
    return "AI provider configured but no model specified — deterministic analysis completed successfully.";
  }

  const topFindings = [...correlatedFindings]
    .sort((a, b) => SEVERITY_RANK[b.severity]! - SEVERITY_RANK[a.severity]!)
    .slice(0, MAX_AI_ANALYZED_FINDINGS);

  for (const finding of topFindings) {
    try {
      const matchedLines = finding.evidence[0]?.detail?.matchedLines;
      const prompt = buildFindingAnalysisPrompt({
        category: finding.category,
        title: finding.title,
        description: finding.description,
        filePath: finding.filePath,
        codeContext: typeof matchedLines === "string" ? matchedLines : finding.description,
      });

      // Result intentionally not persisted here — merging AI analysis back
      // into stored Finding records requires the database-backed findings
      // layer, which is a follow-up phase. This call proves the AI engine
      // composes correctly with real correlated findings end-to-end.
      await completeStructured({
        provider: deps.aiProvider,
        model: deps.aiModel,
        applicationInstructions: prompt.applicationInstructions,
        untrustedContent: prompt.untrustedContent,
        userPrompt: prompt.userPrompt,
        schema: findingAnalysisSchema,
      });
    } catch (error) {
      // An AI failure must never fail the whole scan.
      return `AI analysis failed for one or more findings: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return undefined;
}
