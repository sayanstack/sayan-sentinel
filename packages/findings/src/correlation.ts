import { createHash } from "node:crypto";
import type { ConfidenceLevel, FindingSource, Severity } from "@sayan-sentinel/shared";
import type { FindingDraft } from "./finding";

export interface CorrelatedFinding extends FindingDraft {
  /** Every distinct detector that contributed evidence to this finding. */
  detectedBy: FindingSource[];
}

export interface CorrelationOptions {
  /**
   * Two file-anchored findings on the same file correlate when their line
   * ranges are within this many lines of overlapping. Default 2 — close
   * enough to catch the same statement flagged at slightly different
   * columns/line boundaries by different tools, not so wide that unrelated
   * nearby issues get merged.
   */
  lineProximity?: number;
}

const DEFAULT_LINE_PROXIMITY = 2;

/**
 * Representative-selection priority when merging a group: a dynamic
 * validation result is proven, not inferred, so its account of the issue
 * wins; the Sentinel Rules Engine produces structured, evidence-first
 * findings (source/sink/trace/guards) from first-party AST and data-flow
 * analysis, which is more precise than generic pattern-matching, so it
 * ranks next; static analysis tends to have the most precise rule-based
 * message after that; AI review adds business-logic context but no more
 * certainty than static analysis; secret/dependency/code-intelligence
 * findings are narrowest in scope. This ordering only decides whose title/
 * description/category "wins" for display — severity and confidence are
 * computed across the whole group, not taken from the representative alone.
 */
const REPRESENTATIVE_PRIORITY: FindingSource[] = [
  "dynamic_validation",
  "rules_engine",
  "static_analysis",
  "ai_review",
  "secret_detection",
  "dependency_analysis",
  "code_intelligence",
];

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
const SEVERITY_BY_RANK: Severity[] = ["info", "low", "medium", "high", "critical"];

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  confirmed: 3,
};
const CONFIDENCE_BY_RANK: ConfidenceLevel[] = ["low", "medium", "high", "confirmed"];

function lineRangesNearOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  proximity: number,
): boolean {
  return aStart <= bEnd + proximity && bStart <= aEnd + proximity;
}

function shouldCorrelate(a: FindingDraft, b: FindingDraft, lineProximity: number): boolean {
  // Same detector, same rule, same file: this is the same underlying scan
  // producing the same draft twice (e.g. re-run), not two independent
  // detectors agreeing — still one finding, but doesn't count toward
  // multi-source confidence escalation the way a genuine cross-source
  // match does. Handled the same as any other match here; detectedBy
  // dedupes sources afterward regardless.
  if (a.filePath && b.filePath && a.filePath === b.filePath) {
    if (a.lineStart !== undefined && b.lineStart !== undefined) {
      const aEnd = a.lineEnd ?? a.lineStart;
      const bEnd = b.lineEnd ?? b.lineStart;
      return lineRangesNearOverlap(a.lineStart, aEnd, b.lineStart, bEnd, lineProximity);
    }
    // Neither has line info (e.g. a whole-file finding) — same file and
    // same category is the strongest signal available.
    if (a.lineStart === undefined && b.lineStart === undefined) {
      return a.category === b.category;
    }
    return false;
  }

  // Non-file-anchored findings (dependency advisories keyed by package):
  // match on identical category (advisory id) + symbol (package@version).
  if (!a.filePath && !b.filePath) {
    return a.category === b.category && a.symbol === b.symbol;
  }

  return false;
}

function pickRepresentative(group: FindingDraft[]): FindingDraft {
  let best = group[0]!;
  let bestRank = REPRESENTATIVE_PRIORITY.indexOf(best.primarySource);
  for (const candidate of group.slice(1)) {
    const rank = REPRESENTATIVE_PRIORITY.indexOf(candidate.primarySource);
    if (rank !== -1 && (bestRank === -1 || rank < bestRank)) {
      best = candidate;
      bestRank = rank;
    }
  }
  return best;
}

function highestSeverity(severities: Severity[]): Severity {
  const maxRank = Math.max(...severities.map((s) => SEVERITY_RANK[s]));
  return SEVERITY_BY_RANK[maxRank]!;
}

/**
 * When two or more independent detectors agree on the same issue, that
 * agreement is itself evidence — bump confidence up one level (capped at
 * "confirmed"). A single detector's confidence, or multiple *identical*
 * detections from the same detector, is left unchanged.
 */
function resolveConfidence(
  confidences: ConfidenceLevel[],
  distinctSourceCount: number,
): ConfidenceLevel {
  const maxRank = Math.max(...confidences.map((c) => CONFIDENCE_RANK[c]));
  const escalated =
    distinctSourceCount >= 2 ? Math.min(maxRank + 1, CONFIDENCE_BY_RANK.length - 1) : maxRank;
  return CONFIDENCE_BY_RANK[escalated]!;
}

function dedupeSources(sources: FindingSource[]): FindingSource[] {
  return [...new Set(sources)];
}

/**
 * A source-independent fingerprint for the *merged* finding, distinct
 * from each detector's own per-source fingerprint — so the same
 * underlying issue converges onto the same correlated Finding across
 * scans regardless of which detector(s) happen to catch it each time.
 */
function computeCorrelationFingerprint(representative: FindingDraft): string {
  const anchor =
    representative.evidence[0]?.detail?.matchedLines ??
    (representative.lineStart !== undefined ? String(representative.lineStart) : "");
  const key = [
    "correlated",
    representative.category,
    representative.filePath ?? "",
    representative.symbol ?? "",
    String(anchor),
  ].join("::");
  return createHash("sha256").update(key).digest("hex");
}

function mergeGroup(group: FindingDraft[]): CorrelatedFinding {
  const detectedBy = dedupeSources(group.map((g) => g.primarySource));
  const representative = pickRepresentative(group);
  const evidence = group.flatMap((g) => g.evidence);
  const severity = highestSeverity(group.map((g) => g.severity));
  const confidence = resolveConfidence(
    group.map((g) => g.confidence),
    detectedBy.length,
  );

  // The fingerprint is always the source-independent correlation
  // fingerprint — even for a single-detector group. Otherwise a finding
  // seen by one detector today and two detectors tomorrow would get a
  // *different* fingerprint between scans purely because it crossed from
  // a singleton group into a merged one, defeating the "stable fingerprint
  // across scans" guarantee this whole mechanism exists for.
  return {
    ...representative,
    fingerprint: computeCorrelationFingerprint(representative),
    severity,
    confidence,
    evidence,
    detectedBy,
  };
}

/**
 * Groups findings from potentially multiple detectors (static analysis,
 * secret detection, dependency analysis, AI review, dynamic validation)
 * that describe the same underlying issue into one CorrelatedFinding each,
 * instead of one Finding per detector (Section 16). Uses a simple
 * union-find over pairwise proximity/category matches — not full semantic
 * similarity, which is out of scope for this deterministic pass; the AI
 * engine's own cross-referencing (Phase 9) can suggest additional merges
 * for a human to confirm, but never auto-merges silently.
 */
export function correlateFindings(
  drafts: FindingDraft[],
  options: CorrelationOptions = {},
): CorrelatedFinding[] {
  const lineProximity = options.lineProximity ?? DEFAULT_LINE_PROXIMITY;
  const parent = drafts.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  }

  for (let i = 0; i < drafts.length; i++) {
    for (let j = i + 1; j < drafts.length; j++) {
      if (shouldCorrelate(drafts[i]!, drafts[j]!, lineProximity)) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < drafts.length; i++) {
    const root = find(i);
    const members = groups.get(root) ?? [];
    members.push(i);
    groups.set(root, members);
  }

  return [...groups.values()].map((indices) => mergeGroup(indices.map((i) => drafts[i]!)));
}
