import type { SourceFile } from "ts-morph";

export interface SuppressionRecord {
  ruleId: string;
  reason: string;
  line: number;
}

const SUPPRESSION_PATTERN = /sentinel-ignore\s+([A-Z0-9-]+)\s+--\s+(.+)/;

/**
 * Parses `// sentinel-ignore SENTINEL-XXX-001 -- reason` comments from a
 * source file. A reason is mandatory — a bare `sentinel-ignore RULE_ID` with
 * no `-- reason` does not suppress anything, so silent suppressions can't
 * slip in unreviewed. Suppressions are recorded (not silently dropped) so
 * the CLI/report can surface an audit trail of what was suppressed and why.
 */
export function parseSuppressions(sourceFile: SourceFile): SuppressionRecord[] {
  const records: SuppressionRecord[] = [];
  // A full-text, line-anchored regex scan is the simplest reliable way to catch
  // suppression directives in both single-line and block comments, since these
  // are directive text meant for humans/tools, not code the AST needs to model.
  const text = sourceFile.getFullText();
  const lines = text.split("\n");
  lines.forEach((lineText, index) => {
    const match = lineText.match(SUPPRESSION_PATTERN);
    const ruleId = match?.[1];
    const reason = match?.[2];
    if (ruleId && reason) {
      records.push({ ruleId, reason: reason.trim(), line: index + 1 });
    }
  });
  return records;
}

/** A finding on `line` is suppressed when a `sentinel-ignore` comment for its rule appears on the same line or the line immediately above. */
export function isSuppressed(
  suppressions: SuppressionRecord[],
  ruleId: string,
  line: number,
): SuppressionRecord | undefined {
  return suppressions.find((s) => s.ruleId === ruleId && (s.line === line || s.line === line - 1));
}
