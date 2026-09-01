import type { ConfidenceLevel, FindingStatus, Severity } from "@sayan-sentinel/shared";

export interface ScoredFindingInput {
  severity: Severity;
  confidence: ConfidenceLevel;
  status: FindingStatus;
  firstSeenAt: Date;
  /** True once a dynamic validation has actually confirmed exploitability. */
  validatedByDynamicTesting?: boolean;
}

export interface SecurityScoreBreakdownEntry {
  severity: Severity;
  count: number;
  totalPenalty: number;
}

export interface SecurityScoreResult {
  /** 0-100. Never negative, never fabricated — computed purely from the findings passed in. */
  score: number;
  openFindingCount: number;
  breakdown: SecurityScoreBreakdownEntry[];
}

const OPEN_STATUSES: readonly FindingStatus[] = ["open", "confirmed", "likely", "needs_review"];

/**
 * Base penalty per open finding, by severity. Deliberately steep at the
 * top: a handful of criticals should visibly dominate the score rather
 * than being smoothed out by dozens of low-severity findings.
 */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
  info: 0.5,
};

/** Lower-confidence findings penalize less — they might not be real. */
const CONFIDENCE_MULTIPLIER: Record<ConfidenceLevel, number> = {
  confirmed: 1,
  high: 0.85,
  medium: 0.6,
  low: 0.35,
};

/** A finding actually proven exploitable via dynamic validation is worse than an unverified one of the same severity. */
const DYNAMIC_VALIDATION_MULTIPLIER = 1.2;

/** Open findings ramp from 1x to this multiplier over AGE_RAMP_DAYS, rewarding fast remediation. */
const MAX_AGE_MULTIPLIER = 1.5;
const AGE_RAMP_DAYS = 30;

function ageMultiplier(firstSeenAt: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - firstSeenAt.getTime()) / (1000 * 60 * 60 * 24));
  const rampFraction = Math.min(1, ageDays / AGE_RAMP_DAYS);
  return 1 + rampFraction * (MAX_AGE_MULTIPLIER - 1);
}

/**
 * The Sentinel Security Score: a transparent, deterministic 0-100 score
 * computed as `100 - sum(penalty)` over every currently-open finding,
 * where each finding's penalty is
 * `severityWeight * confidenceMultiplier * ageMultiplier * validationMultiplier`.
 *
 * This is Sentinel's own metric, not an industry-standard score (e.g. not
 * CVSS-equivalent) — it exists to prioritize and trend this repository's
 * posture over time, documented here rather than treated as a black box:
 *
 * - Resolved, false-positive, and accepted-risk findings never count.
 * - Older open findings cost more (up to 1.5x at 30+ days) — the score
 *   rewards fixing things quickly, not just having few findings today.
 * - A finding a human dynamically confirmed as exploitable costs 1.2x more
 *   than an equivalent unverified static finding.
 * - The score floors at 0 (never negative) and is always deterministic —
 *   the same finding set produces the same score, never a random one.
 */
export function computeSecurityScore(
  findings: ScoredFindingInput[],
  now: Date = new Date(),
): SecurityScoreResult {
  let totalPenalty = 0;
  let openFindingCount = 0;
  const breakdownMap = new Map<Severity, SecurityScoreBreakdownEntry>();

  for (const finding of findings) {
    if (!OPEN_STATUSES.includes(finding.status)) continue;
    openFindingCount += 1;

    const penalty =
      SEVERITY_WEIGHT[finding.severity] *
      CONFIDENCE_MULTIPLIER[finding.confidence] *
      ageMultiplier(finding.firstSeenAt, now) *
      (finding.validatedByDynamicTesting ? DYNAMIC_VALIDATION_MULTIPLIER : 1);

    totalPenalty += penalty;

    const entry = breakdownMap.get(finding.severity) ?? {
      severity: finding.severity,
      count: 0,
      totalPenalty: 0,
    };
    entry.count += 1;
    entry.totalPenalty += penalty;
    breakdownMap.set(finding.severity, entry);
  }

  return {
    score: Math.max(0, Math.round(100 - totalPenalty)),
    openFindingCount,
    breakdown: [...breakdownMap.values()],
  };
}
