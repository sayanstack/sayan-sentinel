import { createProviderFromConfig } from "@sayan-sentinel/ai-engine";
import {
  buildCodeGraphFromDirectory,
  cloneRepositoryAtCommit,
  walkRepositoryFiles,
} from "@sayan-sentinel/code-intelligence";
import type { SentinelConfig } from "@sayan-sentinel/config";
import {
  GitleaksAdapter,
  OsvScannerAdapter,
  SemgrepAdapter,
  type ScannerAdapter,
} from "@sayan-sentinel/security-engine";
import { DEFAULT_POLICY_RULES } from "@sayan-sentinel/policy-engine";
import type { ConnectionOptions, Job } from "bullmq";
import { Worker } from "bullmq";
import { runScanPipeline } from "../pipeline/run-scan-pipeline";
import type { ScanPipelineDependencies, ScanPipelineResult } from "../pipeline/types";
import { SCAN_QUEUE_NAME, type ScanJobData } from "./queue-names";

function buildScanners(config: SentinelConfig): ScannerAdapter[] {
  return [
    new SemgrepAdapter({ bin: config.env.SEMGREP_BIN }),
    new GitleaksAdapter({ bin: config.env.GITLEAKS_BIN }),
    new OsvScannerAdapter({ bin: config.env.OSV_SCANNER_BIN }),
  ];
}

function buildDependencies(config: SentinelConfig): ScanPipelineDependencies {
  return {
    cloneRepository: cloneRepositoryAtCommit,
    walkRepositoryFiles: async (rootDir) => walkRepositoryFiles(rootDir),
    buildCodeGraph: buildCodeGraphFromDirectory,
    scanners: buildScanners(config),
    aiProvider: createProviderFromConfig(config),
    aiModel: config.env.AI_MODEL || undefined,
    policyRules: DEFAULT_POLICY_RULES,
  };
}

/**
 * Starts the real BullMQ consumer for the scan queue. Requires a
 * reachable Redis — see the honesty note in scan-queue.ts; this has not
 * been run against a live queue in this environment.
 */
export function startScanWorker(
  config: SentinelConfig,
  connection: ConnectionOptions,
): Worker<ScanJobData> {
  const deps = buildDependencies(config);

  return new Worker<ScanJobData, ScanPipelineResult>(
    SCAN_QUEUE_NAME,
    async (job: Job<ScanJobData>) => {
      return runScanPipeline(
        {
          repositoryUrl: job.data.repositoryUrl,
          commitSha: job.data.commitSha,
          branch: job.data.branch,
          workspaceDir: job.data.workspaceDir,
          scanId: job.data.scanId,
          localLabMode: job.data.localLabMode,
        },
        deps,
      );
    },
    { connection, concurrency: 1 },
  );
}
