import * as path from "node:path";
import type { ScanOptions, ScanOutcome, ScannerAdapter, ScannerAvailability } from "../adapter";
import { checkBinaryAvailability, runScannerProcess } from "../process";
import { normalizeSemgrepOutput } from "./normalize";
import type { SemgrepOutput } from "./types";

export interface SemgrepAdapterOptions {
  bin?: string;
  /** Semgrep rule config: "auto", a registry ruleset like "p/security-audit", or a local path. */
  config?: string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

export class SemgrepAdapter implements ScannerAdapter {
  readonly name = "semgrep";
  private readonly bin: string;
  private readonly config: string;

  constructor(options: SemgrepAdapterOptions = {}) {
    this.bin = options.bin ?? "semgrep";
    this.config = options.config ?? "auto";
  }

  checkAvailability(): Promise<ScannerAvailability> {
    return checkBinaryAvailability(this.bin, ["--version"]);
  }

  async scan(targetDir: string, options: ScanOptions = {}): Promise<ScanOutcome> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();

    const outcome = await runScannerProcess(
      this.bin,
      ["scan", "--config", this.config, "--json", "--quiet", path.resolve(targetDir)],
      { timeoutMs },
    );

    const durationMs = Date.now() - startedAt;

    if (outcome.kind === "not_found") {
      return { status: "unavailable", reason: `"${this.bin}" is not installed or not on PATH` };
    }
    if (outcome.kind === "timeout") {
      return { status: "failed", error: `semgrep scan timed out after ${timeoutMs}ms`, durationMs };
    }
    if (outcome.kind === "error") {
      return { status: "failed", error: outcome.message, durationMs };
    }

    let parsed: SemgrepOutput;
    try {
      parsed = JSON.parse(outcome.result.stdout) as SemgrepOutput;
    } catch {
      return {
        status: "failed",
        error: `semgrep produced non-JSON output: ${outcome.result.stderr.slice(0, 500)}`,
        durationMs,
      };
    }

    const findings = normalizeSemgrepOutput(parsed);
    return { status: "completed", findings, durationMs, rawFindingCount: parsed.results.length };
  }
}
