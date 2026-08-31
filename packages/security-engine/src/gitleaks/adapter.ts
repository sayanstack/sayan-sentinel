import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ScanOptions, ScanOutcome, ScannerAdapter, ScannerAvailability } from "../adapter";
import { checkBinaryAvailability, runScannerProcess } from "../process";
import { normalizeGitleaksOutput } from "./normalize";
import type { GitleaksOutput } from "./types";

export interface GitleaksAdapterOptions {
  bin?: string;
}

const DEFAULT_TIMEOUT_MS = 3 * 60_000;

export class GitleaksAdapter implements ScannerAdapter {
  readonly name = "gitleaks";
  private readonly bin: string;

  constructor(options: GitleaksAdapterOptions = {}) {
    this.bin = options.bin ?? "gitleaks";
  }

  checkAvailability(): Promise<ScannerAvailability> {
    return checkBinaryAvailability(this.bin, ["version"]);
  }

  async scan(targetDir: string, options: ScanOptions = {}): Promise<ScanOutcome> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    const reportDir = await fsp.mkdtemp(path.join(os.tmpdir(), "sentinel-gitleaks-"));
    const reportPath = path.join(reportDir, "report.json");

    try {
      const outcome = await runScannerProcess(
        this.bin,
        [
          "detect",
          "--source",
          path.resolve(targetDir),
          "--no-git",
          "--report-format",
          "json",
          "--report-path",
          reportPath,
          // Always exit 0 — a non-zero exit then reliably means a real
          // error (bad args, unreadable source), not "leaks were found".
          "--exit-code",
          "0",
        ],
        { timeoutMs },
      );

      const durationMs = Date.now() - startedAt;

      if (outcome.kind === "not_found") {
        return { status: "unavailable", reason: `"${this.bin}" is not installed or not on PATH` };
      }
      if (outcome.kind === "timeout") {
        return { status: "failed", error: `gitleaks scan timed out after ${timeoutMs}ms`, durationMs };
      }
      if (outcome.kind === "error") {
        return { status: "failed", error: outcome.message, durationMs };
      }
      if (outcome.result.exitCode !== 0) {
        return {
          status: "failed",
          error: `gitleaks exited ${outcome.result.exitCode}: ${outcome.result.stderr.slice(0, 500)}`,
          durationMs,
        };
      }

      let raw: string;
      try {
        raw = await fsp.readFile(reportPath, "utf8");
      } catch {
        return { status: "completed", findings: [], durationMs, rawFindingCount: 0 };
      }

      let parsed: GitleaksOutput;
      try {
        parsed = raw.trim() ? (JSON.parse(raw) as GitleaksOutput) : [];
      } catch {
        return { status: "failed", error: `gitleaks produced non-JSON report: ${raw.slice(0, 500)}`, durationMs };
      }

      const findings = normalizeGitleaksOutput(parsed);
      return { status: "completed", findings, durationMs, rawFindingCount: parsed.length };
    } finally {
      await fsp.rm(reportDir, { recursive: true, force: true });
    }
  }
}
