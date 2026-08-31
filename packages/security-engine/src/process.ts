import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScannerAvailability } from "./adapter";

const execFileAsync = promisify(execFile);

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type RunOutcome =
  | { kind: "ok"; result: RunResult }
  | { kind: "not_found" }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

/**
 * Runs a scanner CLI, distinguishing "binary not installed" (ENOENT) and a
 * timeout from a genuine crash. Many scanners (Semgrep, gitleaks with
 * `--exit-code`) intentionally exit non-zero when they find something, so
 * a non-zero exit with valid stdout is still reported as `ok` — the
 * caller, not this helper, decides whether the output parses.
 */
export async function runScannerProcess(
  bin: string,
  args: string[],
  options: { timeoutMs: number; cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<RunOutcome> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: options.timeoutMs,
      cwd: options.cwd,
      env: options.env ?? process.env,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return { kind: "ok", result: { stdout, stderr, exitCode: 0 } };
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };

    if (execError.code === "ENOENT") {
      return { kind: "not_found" };
    }
    if (execError.killed && execError.signal === "SIGTERM") {
      return { kind: "timeout" };
    }
    if (typeof execError.stdout === "string") {
      return {
        kind: "ok",
        result: {
          stdout: execError.stdout,
          stderr: execError.stderr ?? "",
          exitCode: typeof execError.code === "number" ? execError.code : 1,
        },
      };
    }
    return { kind: "error", message: execError.message };
  }
}

export async function checkBinaryAvailability(
  bin: string,
  versionArgs: string[] = ["--version"],
): Promise<ScannerAvailability> {
  const outcome = await runScannerProcess(bin, versionArgs, { timeoutMs: 10_000 });

  if (outcome.kind === "not_found") {
    return { available: false, reason: `"${bin}" is not installed or not on PATH` };
  }
  if (outcome.kind === "timeout") {
    return { available: false, reason: `"${bin} ${versionArgs.join(" ")}" timed out` };
  }
  if (outcome.kind === "error") {
    return { available: false, reason: outcome.message };
  }
  const version = outcome.result.stdout.trim() || outcome.result.stderr.trim();
  return { available: true, version: version || undefined };
}
