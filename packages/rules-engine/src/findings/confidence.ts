import type { ConfidenceLevel } from "@sayan-sentinel/shared";

export interface ConfidenceSignal {
  label: string;
  weight: number;
  present: boolean;
}

export interface ConfidenceResult {
  score: number;
  level: ConfidenceLevel;
  signals: ConfidenceSignal[];
}

const BASE_SCORE = 35;

/**
 * Additive confidence scoring, documented so a reviewer can see exactly why
 * a finding landed at a given level rather than trusting an opaque number.
 * Static analysis can approximate but never *prove* a vulnerability, so
 * this never reaches "confirmed" — that level is reserved for dynamic
 * validation, which the correlation engine applies on top when available.
 * Score is clamped to [5, 95] deliberately: a candidate that survived every
 * rule-specific filter is never "no confidence" (5 floor), and a purely
 * static approximation is never "certain" (95 ceiling).
 */
export function computeConfidence(signals: ConfidenceSignal[]): ConfidenceResult {
  let score = BASE_SCORE;
  for (const signal of signals) {
    if (signal.present) score += signal.weight;
  }
  score = Math.max(5, Math.min(95, score));
  const level: ConfidenceLevel = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  return { score, level, signals };
}
