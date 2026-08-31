import { parseSuppressions } from "./suppressions";
import type { RuleContext } from "./RuleContext";
import type { RuleRegistry } from "./RuleRegistry";
import { isRuleEnabled, severityOverride } from "./config";
import type { RuleFinding } from "./types";

export interface RuleRunResult {
  findings: RuleFinding[];
  rulesExecuted: string[];
  suppressedCount: number;
  /** Rule id -> error message, for rules that threw rather than silently disappearing from results. */
  errors: Record<string, string>;
  durationMs: number;
}

export interface RuleRunOptions {
  /** Restrict execution to these rule IDs (e.g. CLI `--rule`). Empty/undefined runs every registered, enabled rule. */
  onlyRuleIds?: string[];
}

/**
 * Executes every registered, enabled rule against a context, applying
 * config overrides, inline `sentinel-ignore` suppressions, and per-rule
 * error isolation — one rule throwing (e.g. on a malformed fixture) does
 * not take down the whole scan, but is reported rather than swallowed.
 */
export async function runRules(
  registry: RuleRegistry,
  context: RuleContext,
  options: RuleRunOptions = {},
): Promise<RuleRunResult> {
  const startedAt = Date.now();
  const findings: RuleFinding[] = [];
  const rulesExecuted: string[] = [];
  const errors: Record<string, string> = {};
  let suppressedCount = 0;

  const suppressionsByFile = new Map<string, ReturnType<typeof parseSuppressions>>();
  for (const sourceFile of context.sourceFiles) {
    suppressionsByFile.set(context.relativePath(sourceFile), parseSuppressions(sourceFile));
  }

  const rulesToRun = registry
    .all()
    .filter((rule) => !options.onlyRuleIds?.length || options.onlyRuleIds.includes(rule.id))
    .filter((rule) => isRuleEnabled(context.config, rule.id));

  for (const rule of rulesToRun) {
    rulesExecuted.push(rule.id);
    try {
      const ruleFindings = await rule.analyze(context);
      const overrideSeverity = severityOverride(context.config, rule.id);

      for (const finding of ruleFindings) {
        const suppressions = suppressionsByFile.get(finding.filePath) ?? [];
        const suppression = suppressions.find(
          (s) =>
            s.ruleId === finding.ruleId &&
            (s.line === finding.lineStart || s.line === finding.lineStart - 1),
        );
        if (suppression) {
          suppressedCount++;
          continue;
        }
        findings.push(overrideSeverity ? { ...finding, severity: overrideSeverity } : finding);
      }
    } catch (error) {
      errors[rule.id] = error instanceof Error ? error.message : String(error);
    }
  }

  return { findings, rulesExecuted, suppressedCount, errors, durationMs: Date.now() - startedAt };
}
