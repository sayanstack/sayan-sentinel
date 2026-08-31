import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { type IngestionPolicy, resolveIngestionPolicy } from "./ingestion-policy";
import { isWithinRoot } from "./path-safety";

export interface WalkedFile {
  /** Path relative to the walk root, using forward slashes. */
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
}

export type SkipReason =
  | "excluded_dir"
  | "too_large"
  | "binary"
  | "symlink_escapes_root"
  | "repository_size_budget_exceeded"
  | "unreadable";

export interface SkippedEntry {
  relativePath: string;
  reason: SkipReason;
}

export interface WalkResult {
  files: WalkedFile[];
  skipped: SkippedEntry[];
  totalBytes: number;
}

/** Reads the first chunk of a file and treats a NUL byte as a binary signal. */
async function looksBinary(absolutePath: string): Promise<boolean> {
  const handle = await fsp.open(absolutePath, "r");
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

/**
 * Walks `root` for analyzable source files, treating everything under it as
 * untrusted: symlinks are never followed outside `root`, vendor/generated
 * directories are skipped, individual files over the size limit are
 * skipped rather than truncated, binary files are excluded by content
 * sniff (not just extension), and the walk aborts once the aggregate byte
 * budget is exceeded rather than reading an unbounded amount of untrusted
 * content into memory.
 */
export async function walkRepositoryFiles(
  root: string,
  policyOverrides?: Partial<IngestionPolicy>,
): Promise<WalkResult> {
  const policy = resolveIngestionPolicy(policyOverrides);
  const resolvedRoot = path.resolve(root);
  const files: WalkedFile[] = [];
  const skipped: SkippedEntry[] = [];
  let totalBytes = 0;
  let budgetExceeded = false;

  async function walkDir(dirAbsolutePath: string): Promise<void> {
    if (budgetExceeded) return;

    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(dirAbsolutePath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (budgetExceeded) return;

      const entryAbsolutePath = path.join(dirAbsolutePath, entry.name);
      const relativePath = path.relative(resolvedRoot, entryAbsolutePath).split(path.sep).join("/");

      if (entry.isDirectory()) {
        if (policy.excludedDirNames.includes(entry.name)) {
          skipped.push({ relativePath, reason: "excluded_dir" });
          continue;
        }
        await walkDir(entryAbsolutePath);
        continue;
      }

      if (entry.isSymbolicLink()) {
        let realPath: string;
        try {
          realPath = await fsp.realpath(entryAbsolutePath);
        } catch {
          skipped.push({ relativePath, reason: "unreadable" });
          continue;
        }
        if (!isWithinRoot(resolvedRoot, realPath)) {
          skipped.push({ relativePath, reason: "symlink_escapes_root" });
          continue;
        }
      } else if (!entry.isFile()) {
        continue;
      }

      let stats: import("node:fs").Stats;
      try {
        stats = await fsp.stat(entryAbsolutePath);
      } catch {
        skipped.push({ relativePath, reason: "unreadable" });
        continue;
      }

      if (!stats.isFile()) continue;

      if (stats.size > policy.maxFileSizeBytes) {
        skipped.push({ relativePath, reason: "too_large" });
        continue;
      }

      if (totalBytes + stats.size > policy.maxRepositorySizeBytes) {
        budgetExceeded = true;
        skipped.push({ relativePath, reason: "repository_size_budget_exceeded" });
        return;
      }

      try {
        if (await looksBinary(entryAbsolutePath)) {
          skipped.push({ relativePath, reason: "binary" });
          continue;
        }
      } catch {
        skipped.push({ relativePath, reason: "unreadable" });
        continue;
      }

      totalBytes += stats.size;
      files.push({ relativePath, absolutePath: entryAbsolutePath, sizeBytes: stats.size });
    }
  }

  await walkDir(resolvedRoot);

  return { files, skipped, totalBytes };
}
