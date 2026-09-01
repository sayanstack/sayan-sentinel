import type { SafeHttpClientOptions } from "@sayan-sentinel/web-security-engine";

/**
 * BullMQ rejects `:` in queue names (it uses the character internally as a
 * Redis key separator) — this was originally `"sentinel:scan"` and would
 * have thrown `Queue name cannot contain :` the moment either
 * `createScanQueue` or `startScanWorker` first ran against a real Redis.
 * Neither had ever been exercised against one before the `scan-queue.test.ts`
 * added alongside this fix caught it.
 */
export const SCAN_QUEUE_NAME = "sentinel-scan";

export interface ScanJobData {
  repositoryUrl: string;
  commitSha: string;
  branch?: string;
  workspaceDir: string;
  scanId: string;
  localLabMode: boolean;
  /**
   * The `Repository` row this scan's findings persist against, and the
   * event that triggered it — both required for `persistScanResult` to
   * write a real `Scan`/`Finding` row rather than only returning the
   * result in-memory. A caller enqueueing a job for a repository that
   * hasn't been created yet (e.g. testing against an ad-hoc clone) should
   * omit these; the worker then still runs the full scan but skips
   * persistence entirely, never writing to the wrong repository's row.
   */
  repositoryId?: string;
  trigger?: "MANUAL" | "PUSH" | "PULL_REQUEST" | "SCHEDULED";
  /**
   * Present only when the scan should report a GitHub Check Run —
   * omitted for a scan with no corresponding GitHub context (e.g. a
   * manually-triggered scan of an unregistered clone). `installationId`
   * is GitHub's numeric installation ID, not this app's internal
   * `Installation.id`.
   */
  github?: {
    installationId: number;
    owner: string;
    repo: string;
  };
  /**
   * Present only for a Full Stack Scan against a verified, deployed
   * target — omitted entirely for an ordinary code-only scan, which stays
   * on the existing `runScanPipeline` path unchanged. `scopeGuard` comes
   * from converting a verified `TargetAuthorization` row via
   * `toScopeGuardRecord` (`apps/api/src/targets/`) before the job is
   * enqueued; the worker never looks up or verifies a target itself.
   */
  webTarget?: {
    baseUrl: string;
    scopeGuard: SafeHttpClientOptions;
  };
}
