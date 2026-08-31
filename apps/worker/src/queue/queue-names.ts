import type { SafeHttpClientOptions } from "@sayan-sentinel/web-security-engine";

export const SCAN_QUEUE_NAME = "sentinel:scan";

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
