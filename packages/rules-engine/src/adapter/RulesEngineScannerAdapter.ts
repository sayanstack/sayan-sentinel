import type {
  ScanOptions,
  ScanOutcome,
  ScannerAdapter,
  ScannerAvailability,
} from "@sayan-sentinel/security-engine";
import { walkRepositoryFiles } from "@sayan-sentinel/code-intelligence";
import { RuleEngine } from "../engine/RuleEngine";
import { ruleFindingToDraft } from "../findings/mapper";
import type { SentinelConfig } from "../engine/config";

/**
 * Wraps the Rules Engine behind the same `ScannerAdapter` interface Semgrep/
 * Gitleaks/OSV-Scanner use, so `runScanPipeline` treats it identically —
 * one more entry in the `scanners` array, correlated and scored the same
 * way. Unlike the subprocess-based adapters, this one is always "available"
 * (it's in-process TypeScript, not an external binary), so it can never
 * report `unavailable` for a missing tool — only `failed` if the engine
 * itself throws on a malformed repository.
 */
export class RulesEngineScannerAdapter implements ScannerAdapter {
  readonly name = "sentinel-rules-engine";

  constructor(private readonly config?: SentinelConfig) {}

  async checkAvailability(): Promise<ScannerAvailability> {
    return { available: true, version: "0.1.0" };
  }

  async scan(targetDir: string, _options?: ScanOptions): Promise<ScanOutcome> {
    const startedAt = Date.now();
    try {
      const { files } = await walkRepositoryFiles(targetDir);
      const engine = new RuleEngine();
      const result = await engine.scanDirectory({
        rootDir: targetDir,
        filePaths: files.map((f) => f.relativePath),
        config: this.config,
      });

      return {
        status: "completed",
        findings: result.findings.map(ruleFindingToDraft),
        durationMs: Date.now() - startedAt,
        rawFindingCount: result.findings.length,
      };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      };
    }
  }
}
