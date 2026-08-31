import * as path from "node:path";
import * as fs from "node:fs";
import { walkRepositoryFiles } from "@sayan-sentinel/code-intelligence";
import { RuleEngine } from "../engine/RuleEngine";
import { toSarif } from "../findings/sarif";
import type { RuleFinding } from "../engine/types";

export interface ScanCliOptions {
  targetDir: string;
  format: "table" | "json" | "sarif";
  onlyRuleIds?: string[];
  baselinePath?: string;
}

export interface ScanCliResult {
  exitCode: 0 | 1 | 2;
  output: string;
}

const SEVERITY_RANK: Record<RuleFinding["severity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function loadBaselineFingerprints(baselinePath: string | undefined): Set<string> {
  if (!baselinePath || !fs.existsSync(baselinePath)) return new Set();
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
    return new Set(Array.isArray(parsed.fingerprints) ? parsed.fingerprints : []);
  } catch {
    return new Set();
  }
}

function formatTable(
  findings: RuleFinding[],
  rulesExecuted: string[],
  durationMs: number,
  newCount?: number,
): string {
  const lines: string[] = [];
  lines.push(`Sentinel Rules Engine — ${rulesExecuted.length} rule(s) executed in ${durationMs}ms`);
  lines.push("");

  if (findings.length === 0) {
    lines.push("No findings.");
  } else {
    for (const finding of [...findings].sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
    )) {
      lines.push(`[${finding.severity.toUpperCase()}] ${finding.ruleId} — ${finding.title}`);
      lines.push(
        `  ${finding.filePath}:${finding.lineStart}${finding.route ? ` (${finding.route})` : ""}`,
      );
      lines.push(`  Confidence: ${finding.confidence} (${finding.confidenceScore}/100)`);
      lines.push(`  ${finding.reason}`);
      lines.push("");
    }
  }

  lines.push(
    `Summary: ${findings.length} finding(s)` +
      (newCount !== undefined ? ` (${newCount} new vs. baseline)` : "") +
      ` — critical: ${findings.filter((f) => f.severity === "critical").length}, ` +
      `high: ${findings.filter((f) => f.severity === "high").length}, ` +
      `medium: ${findings.filter((f) => f.severity === "medium").length}, ` +
      `low/info: ${findings.filter((f) => f.severity === "low" || f.severity === "info").length}`,
  );

  return lines.join("\n");
}

/**
 * Runs a scan and formats the result. Exit codes: `0` — the scan completed
 * and found no high/critical-severity finding (policy passed); `1` — the
 * scan completed but found at least one high/critical-severity finding
 * (policy violation); `2` — the engine could not run at all (bad path,
 * config error, uncaught exception). This mirrors standard linter/scanner
 * exit-code conventions so `sentinel scan` composes into CI directly.
 */
export async function runScanCli(options: ScanCliOptions): Promise<ScanCliResult> {
  const resolvedRoot = path.resolve(options.targetDir);
  if (!fs.existsSync(resolvedRoot)) {
    return { exitCode: 2, output: `Error: path does not exist: ${resolvedRoot}` };
  }

  try {
    const { files } = await walkRepositoryFiles(resolvedRoot);
    const engine = new RuleEngine();
    const result = await engine.scanDirectory({
      rootDir: resolvedRoot,
      filePaths: files.map((f) => f.relativePath),
      onlyRuleIds: options.onlyRuleIds,
    });

    const baselineFingerprints = loadBaselineFingerprints(options.baselinePath);
    const newFindings = baselineFingerprints.size
      ? result.findings.filter(
          (f) => !baselineFingerprints.has(`${f.ruleId}::${f.filePath}::${f.lineStart}`),
        )
      : result.findings;

    const hasPolicyViolation = newFindings.some(
      (f) => f.severity === "critical" || f.severity === "high",
    );

    let output: string;
    if (options.format === "json") {
      output = JSON.stringify(
        {
          findings: result.findings,
          rulesExecuted: result.rulesExecuted,
          durationMs: result.durationMs,
        },
        null,
        2,
      );
    } else if (options.format === "sarif") {
      output = JSON.stringify(toSarif(result.findings, engine.registry.all()), null, 2);
    } else {
      output = formatTable(
        result.findings,
        result.rulesExecuted,
        result.durationMs,
        baselineFingerprints.size ? newFindings.length : undefined,
      );
    }

    return { exitCode: hasPolicyViolation ? 1 : 0, output };
  } catch (error) {
    return {
      exitCode: 2,
      output: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
