import type { ConfidenceLevel, Severity } from "@sayan-sentinel/shared";
import type { RuleContext } from "./RuleContext";

export const RULE_CATEGORIES = [
  "authorization",
  "authentication",
  "injection",
  "api",
  "data-exposure",
  "ssrf",
  "filesystem",
  "crypto",
  "configuration",
  "secrets",
  "logging",
  "framework",
] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export const SUPPORTED_LANGUAGES = ["typescript", "javascript"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const SUPPORTED_FRAMEWORKS = ["express", "nestjs", "nextjs"] as const;
export type SupportedFramework = (typeof SUPPORTED_FRAMEWORKS)[number];

/**
 * One step in a reported data-flow trace. `role` records what the step
 * *meant* at the time it was observed (a source, a pass-through assignment,
 * a validator that changed nothing about authorization, a guard that gated
 * the flow, or the sink it finally reached) so the UI can render each node
 * with distinct visual semantics rather than a flat list of lines.
 */
export interface TraceStep {
  role: "source" | "propagation" | "validator" | "sanitizer" | "authorization_guard" | "sink";
  description: string;
  filePath: string;
  line: number;
  snippet?: string;
}

/**
 * A single piece of supporting evidence for a finding. Evidence-first: every
 * claim a rule makes ("no ownership constraint observed") must be backed by
 * something a reviewer can independently check, not asserted as fact.
 */
export interface RuleEvidence {
  label: string;
  detail: string;
}

export interface RuleFinding {
  ruleId: string;
  title: string;
  description: string;
  category: RuleCategory;
  severity: Severity;
  confidence: ConfidenceLevel;
  /** 0-100 numeric confidence score the ConfidenceLevel bucket was derived from — kept for transparency, never shown as false precision. */
  confidenceScore: number;
  cwe?: string;
  owasp?: string[];
  filePath: string;
  lineStart: number;
  lineEnd: number;
  /** Enclosing function/method name, if any — used for fingerprinting and display. */
  symbol?: string;
  /** Normalized route this finding is reachable from, e.g. "GET /api/accounts/{id}". */
  route?: string;
  /** Human-readable reason this finding fired, independent of the trace. */
  reason: string;
  evidence: RuleEvidence[];
  trace: TraceStep[];
  remediation: string;
}

export interface SentinelRule {
  id: string;
  title: string;
  description: string;
  category: RuleCategory;
  severity: Severity;
  cwe?: string;
  owasp?: string[];
  supportedLanguages: readonly SupportedLanguage[];
  supportedFrameworks?: readonly SupportedFramework[];
  remediation: string;
  analyze(context: RuleContext): RuleFinding[] | Promise<RuleFinding[]>;
}
