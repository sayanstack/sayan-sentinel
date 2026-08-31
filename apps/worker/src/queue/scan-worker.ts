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
import { RulesEngineScannerAdapter } from "@sayan-sentinel/rules-engine";
import { DEFAULT_POLICY_RULES } from "@sayan-sentinel/policy-engine";
import type { ConnectionOptions, Job } from "bullmq";
import { Worker } from "bullmq";
import { runFullStackScanPipeline } from "../pipeline/run-full-stack-scan-pipeline";
import type {
  FullStackScanDependencies,
  FullStackScanResult,
} from "../pipeline/full-stack-scan-types";
import type { ScanPipelineDependencies } from "../pipeline/types";
import { persistScanResult } from "../persistence/persist-scan-result";
import { SCAN_QUEUE_NAME, type ScanJobData } from "./queue-names";

function buildScanners(config: SentinelConfig): ScannerAdapter[] {
  return [
    // First-party, always-available — runs before the external subprocess-based
    // scanners so its findings are present even when none of Semgrep/Gitleaks/
    // OSV-Scanner are installed (SENTINEL_NO_AI / no-external-tools environments).
    new RulesEngineScannerAdapter(),
    new SemgrepAdapter({ bin: config.env.SEMGREP_BIN }),
    new GitleaksAdapter({ bin: config.env.GITLEAKS_BIN }),
    new OsvScannerAdapter({ bin: config.env.OSV_SCANNER_BIN }),
  ];
}

function buildDependencies(config: SentinelConfig): FullStackScanDependencies {
  const deps: ScanPipelineDependencies = {
    cloneRepository: cloneRepositoryAtCommit,
    walkRepositoryFiles: async (rootDir) => walkRepositoryFiles(rootDir),
    buildCodeGraph: buildCodeGraphFromDirectory,
    scanners: buildScanners(config),
    aiProvider: createProviderFromConfig(config),
    aiModel: config.env.AI_MODEL || undefined,
    policyRules: DEFAULT_POLICY_RULES,
  };
  // `createCrawler`/`scanUrl` are left undefined here so runFullStackScanPipeline
  // uses its real defaults (BoundedCrawler, the real scanUrl) — only tests inject fakes.
  return deps;
}

/**
 * Starts the real BullMQ consumer for the scan queue. Requires a
 * reachable Redis — see the honesty note in scan-queue.ts; this has not
 * been run against a live queue in this environment. Every job runs
 * through `runFullStackScanPipeline` — an ordinary code scan and a Full
 * Stack Scan are the same code path, distinguished only by whether
 * `job.data.webTarget` is present, so there's no risk of the two drifting
 * apart into separately-maintained pipelines.
 *
 * When `job.data.repositoryId` is present, the result is also persisted
 * via `persistScanResult` — a real `Scan` row plus upserted `Finding`
 * rows the dashboard's existing `prisma.scan`/`prisma.finding` reads can
 * finally show real data for. A job with no `repositoryId` (e.g. an
 * ad-hoc scan of an unregistered clone) still runs the full scan and
 * returns its result from the job — it just isn't written to a
 * repository's row, since there isn't one to write it against.
 */
export function startScanWorker(
  config: SentinelConfig,
  connection: ConnectionOptions,
): Worker<ScanJobData> {
  const deps = buildDependencies(config);

  return new Worker<ScanJobData, FullStackScanResult>(
    SCAN_QUEUE_NAME,
    async (job: Job<ScanJobData>) => {
      const result = await runFullStackScanPipeline(
        {
          code: {
            repositoryUrl: job.data.repositoryUrl,
            commitSha: job.data.commitSha,
            branch: job.data.branch,
            workspaceDir: job.data.workspaceDir,
            scanId: job.data.scanId,
            localLabMode: job.data.localLabMode,
          },
          webTarget: job.data.webTarget,
        },
        deps,
      );

      if (job.data.repositoryId) {
        await persistScanResult({
          repositoryId: job.data.repositoryId,
          commitSha: job.data.commitSha,
          trigger: job.data.trigger ?? "MANUAL",
          result,
        });
      }

      return result;
    },
    { connection, concurrency: 1 },
  );
}
