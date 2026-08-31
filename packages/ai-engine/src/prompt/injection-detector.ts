interface InjectionPattern {
  pattern: RegExp;
  label: string;
}

/**
 * Heuristic patterns for content that reads as an attempt to redirect the
 * model — logged for audit and surfaced to the caller, but this is
 * defense-in-depth monitoring, NOT the primary defense. The primary
 * defense is architectural: `wrapUntrustedContent` labels this data as
 * untrusted regardless of whether it matches a known pattern, the AI
 * engine's output is only ever schema-validated structured data (never a
 * command), and no tool/action executes as a direct consequence of
 * anything the model read or said (Scope Guard sits outside the model
 * entirely for anything that touches a real system).
 */
const INJECTION_PATTERNS: InjectionPattern[] = [
  { pattern: /ignore (all |any )?(previous|prior|above|earlier) instructions/i, label: "ignore-previous-instructions" },
  { pattern: /disregard (all |any )?(previous|prior|above|earlier)/i, label: "disregard-previous" },
  { pattern: /you are now\b/i, label: "role-override" },
  { pattern: /^\s*system\s*:/im, label: "fake-system-marker" },
  { pattern: /\bnew instructions?\b/i, label: "new-instructions-claim" },
  { pattern: /send (the |my |our )?(secret|password|token|api[ -]?key|credentials?)/i, label: "exfiltration-request" },
  { pattern: /run (this|the following|that) command/i, label: "command-execution-request" },
  { pattern: /reveal (your|the) (system prompt|instructions|configuration)/i, label: "prompt-extraction" },
  { pattern: /act as (if you|though you)('re| are)/i, label: "role-override" },
  { pattern: /\bDAN\b.{0,20}\bmode\b/i, label: "jailbreak-persona" },
];

export interface InjectionScanResult {
  suspicious: boolean;
  matchedLabels: string[];
}

/**
 * Scans a piece of untrusted content for common prompt-injection phrasing.
 * A positive result should be logged/audited and can inform confidence
 * scoring — it must never itself trigger any action; the content is
 * analyzed (wrapped as untrusted) either way.
 */
export function detectPromptInjectionAttempt(content: string): InjectionScanResult {
  const matchedLabels = INJECTION_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(
    ({ label }) => label,
  );
  return { suspicious: matchedLabels.length > 0, matchedLabels: [...new Set(matchedLabels)] };
}
