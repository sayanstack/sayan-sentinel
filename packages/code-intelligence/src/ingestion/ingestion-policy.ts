export interface IngestionPolicy {
  /** Aggregate byte budget across every file read during ingestion. */
  maxRepositorySizeBytes: number;
  /** A single file larger than this is skipped, not truncated. */
  maxFileSizeBytes: number;
  /** Directory names excluded anywhere in the tree (not just at the root). */
  excludedDirNames: readonly string[];
  /** Wall-clock budget for each individual git subprocess. */
  gitCommandTimeoutMs: number;
}

export const DEFAULT_INGESTION_POLICY: IngestionPolicy = Object.freeze({
  maxRepositorySizeBytes: 500 * 1024 * 1024,
  maxFileSizeBytes: 2 * 1024 * 1024,
  excludedDirNames: Object.freeze([
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    "vendor",
    "generated",
    ".venv",
    "venv",
    "__pycache__",
  ]),
  gitCommandTimeoutMs: 120_000,
});

export function resolveIngestionPolicy(overrides?: Partial<IngestionPolicy>): IngestionPolicy {
  return { ...DEFAULT_INGESTION_POLICY, ...overrides };
}
