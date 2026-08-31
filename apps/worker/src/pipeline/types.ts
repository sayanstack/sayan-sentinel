import type { AIProvider } from "@sayan-sentinel/ai-engine";
import type { CodeGraph } from "@sayan-sentinel/code-intelligence";
import type { CorrelatedFinding, SecurityScoreResult } from "@sayan-sentinel/findings";
import type { PolicyEvaluationResult, PolicyRule } from "@sayan-sentinel/policy-engine";
import type { ScannerAdapter, ScannerAvailability } from "@sayan-sentinel/security-engine";

export interface ScanPipelineInput {
  repositoryUrl: string;
  commitSha: string;
  branch?: string;
  workspaceDir: string;
  scanId: string;
  localLabMode: boolean;
}

export interface ScanPipelineDependencies {
  cloneRepository: (input: {
    repositoryUrl: string;
    commitSha: string;
    branch?: string;
    destinationDir: string;
  }) => Promise<{ destinationDir: string; commitSha: string }>;
  walkRepositoryFiles: (rootDir: string) => Promise<{ files: { relativePath: string }[] }>;
  buildCodeGraph: (options: { rootDir: string; filePaths: string[] }) => CodeGraph;
  scanners: ScannerAdapter[];
  /** null when AI isn't configured — the pipeline degrades to deterministic-only, per Section 41/43. */
  aiProvider: AIProvider | null;
  aiModel?: string;
  policyRules: PolicyRule[];
  now?: Date;
}

export interface ScannerRunSummary {
  name: string;
  availability: ScannerAvailability;
  status: "completed" | "unavailable" | "failed";
  rawFindingCount: number;
  error?: string;
}

export interface ScanPipelineResult {
  commitSha: string;
  graph: CodeGraph;
  scannerRuns: ScannerRunSummary[];
  correlatedFindings: CorrelatedFinding[];
  securityScore: SecurityScoreResult;
  policyResult: PolicyEvaluationResult;
  aiAnalysisSkippedReason?: string;
  durationMs: number;
}
