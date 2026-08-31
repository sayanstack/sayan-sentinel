import type { FindingDraft } from "@sayan-sentinel/findings";

export interface ScannerAvailability {
  available: boolean;
  version?: string;
  /** Set when available is false — always a genuine reason, never guessed. */
  reason?: string;
}

export interface ScanOptions {
  timeoutMs?: number;
}

export type ScanOutcome =
  | { status: "completed"; findings: FindingDraft[]; durationMs: number; rawFindingCount: number }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; error: string; durationMs: number };

/**
 * Common shape for every deterministic scanner adapter (Semgrep, Gitleaks,
 * OSV-Scanner, and any future one). `scan()` never fabricates a result: if
 * the underlying tool isn't installed, it returns `unavailable` with the
 * real reason rather than an empty "completed" outcome that would look
 * like a clean scan.
 */
export interface ScannerAdapter {
  readonly name: string;
  checkAvailability(): Promise<ScannerAvailability>;
  scan(targetDir: string, options?: ScanOptions): Promise<ScanOutcome>;
}
