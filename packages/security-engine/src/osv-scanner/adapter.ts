import * as path from "node:path";
import type { ScanOptions, ScanOutcome, ScannerAdapter, ScannerAvailability } from "../adapter";
import { checkBinaryAvailability, runScannerProcess } from "../process";
import { normalizeOsvOutput } from "./normalize";
import type { OsvOutput } from "./types";

export interface OsvScannerAdapterOptions {
  bin?: string;
}

const DEFAULT_TIMEOUT_MS = 3 * 60_000;

export class OsvScannerAdapter implements ScannerAdapter {
  readonly name = "osv-scanner";
  private readonly bin: string;

  constructor(options: OsvScannerAdapterOptions = {}) {
    this.bin = options.bin ?? "osv-scanner";
  }

  checkAvailability(): Promise<ScannerAvailability> {
    return checkBinaryAvailability(this.bin, ["--version"]);
  }

  async scan(targetDir: string, options: ScanOptions = {}): Promise<ScanOutcome> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();

    const outcome = await runScannerProcess(this.bin, ["--format", "json", "--recursive", path.resolve(targetDir)], {
      timeoutMs,
    });

    const durationMs = Date.now() - startedAt;

    if (outcome.kind === "not_found") {
      return { status: "unavailable", reason: `"${this.bin}" is not installed or not on PATH` };
    }
    if (outcome.kind === "timeout") {
      return { status: "failed", error: `osv-scanner scan timed out after ${timeoutMs}ms`, durationMs };
    }
    if (outcome.kind === "error") {
      return { status: "failed", error: outcome.message, durationMs };
    }

    if (!outcome.result.stdout.trim()) {
      return { status: "completed", findings: [], durationMs, rawFindingCount: 0 };
    }

    let parsed: OsvOutput;
    try {
      parsed = JSON.parse(outcome.result.stdout) as OsvOutput;
    } catch {
      return {
        status: "failed",
        error: `osv-scanner produced non-JSON output: ${outcome.result.stderr.slice(0, 500)}`,
        durationMs,
      };
    }

    const findings = normalizeOsvOutput(parsed);
    const rawFindingCount = parsed.results.reduce(
      (sum, r) => sum + r.packages.reduce((s2, p) => s2 + (p.vulnerabilities?.length ?? 0), 0),
      0,
    );
    return { status: "completed", findings, durationMs, rawFindingCount };
  }
}
