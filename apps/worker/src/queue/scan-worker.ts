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
import { GitHubAppClient, resolvePrivateKey } from "@sayan-sentinel/github";
import type { ConnectionOptions, Job } from "bullmq";
import { Worker } from "bullmq";
import { runFullStackScanPipeline } from "../pipeline/run-full-stack-scan-pipeline";
import type {
  FullStackScanDependencies,
  FullStackScanResult,
} from "../pipeline/full-stack-scan-types";
import type { ScanPipelineDependencies } from "../pipeline/types";
import { persistScanResult } from "../persistence/persist-scan-result";
import { buildCheckRunSummary } from "../github/build-check-run-summary";
import { SCAN_QUEUE_NAME, type ScanJobData } from "@sayan-sentinel/queue";

function buildGitHubAppClient(config: SentinelConfig): GitHubAppClient | null {
  const {
    GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY,
    GITHUB_APP_PRIVATE_KEY_PATH,
    GITHUB_WEBHOOK_SECRET,
  } = config.env;
  if (!GITHUB_APP_ID || !GITHUB_WEBHOOK_SECRET) return null;
  const privateKey = resolvePrivateKey({
    inline: GITHUB_APP_PRIVATE_KEY,
    path: GITHUB_APP_PRIVATE_KEY_PATH,
  });
  if (!privateKey) return null;
  return new GitHubAppClient({
    appId: GITHUB_APP_ID,
    privateKey,
    webhookSecret: GITHUB_WEBHOOK_SECRET,
  });
}

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
 * reachable Redis — see the honesty note in @sayan-sentinel/queue's
 * scan-queue.ts; this has not
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
 *
 * When `job.data.github` is present *and* the GitHub App is actually
 * configured (all three of `GITHUB_APP_ID`/`GITHUB_APP_PRIVATE_KEY_PATH`/
 * `GITHUB_WEBHOOK_SECRET` set — matching `deriveFeatureFlags`'
 * `githubAppEnabled` check exactly), the result also posts a real GitHub
 * Check Run via `createCheckRun` — a method that has existed in
 * `@sayan-sentinel/github` since an earlier phase but was never actually
 * called from anywhere until now. A Check Run failure never fails the
 * scan job itself — reporting status is a side effect of a completed
 * scan, not a precondition for one.
 */
/**
 * The actual per-job work, factored out of the BullMQ processor callback so
 * it can be unit-tested without a live Redis connection — `startScanWorker`
 * itself has never been (and still isn't) exercised by a test, since
 * constructing a real `Worker` requires a reachable Redis.
 */
export async function processScanJob(
  job: Job<ScanJobData>,
  deps: FullStackScanDependencies,
  githubClient: GitHubAppClient | null,
): Promise<FullStackScanResult> {
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

  if (job.data.github && githubClient) {
    const { installationId, owner, repo } = job.data.github;
    const summary = buildCheckRunSummary(job.data.commitSha, result);
    try {
      await githubClient.createCheckRun(installationId, owner, repo, summary);
    } catch {
      // A GitHub API failure (rate limit, revoked installation, ...) must
      // never fail an otherwise-successful scan job.
    }
  }

  return result;
}

export function startScanWorker(
  config: SentinelConfig,
  connection: ConnectionOptions,
): Worker<ScanJobData> {
  const deps = buildDependencies(config);
  const githubClient = buildGitHubAppClient(config);

  return new Worker<ScanJobData, FullStackScanResult>(
    SCAN_QUEUE_NAME,
    (job: Job<ScanJobData>) => processScanJob(job, deps, githubClient),
    { connection, concurrency: 1 },
  );
}
