export const SCAN_QUEUE_NAME = "sentinel:scan";

export interface ScanJobData {
  repositoryUrl: string;
  commitSha: string;
  branch?: string;
  workspaceDir: string;
  scanId: string;
  localLabMode: boolean;
}
