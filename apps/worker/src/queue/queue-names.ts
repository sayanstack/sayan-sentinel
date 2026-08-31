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
