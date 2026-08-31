import { createHash } from "node:crypto";
import type { FindingSource } from "@sayan-sentinel/shared";

export interface FingerprintInput {
  source: FindingSource;
  /** Rule id, advisory id, secret detector rule id — whatever identifies *what* was matched. */
  category: string;
  filePath?: string;
  symbol?: string;
  /**
   * The matched snippet/context, when the scanner provides one. Preferred
   * over `lineStart` as the stability anchor: unrelated edits elsewhere in
   * the file shift line numbers without changing the finding, so anchoring
   * on the actual matched text keeps the same finding's fingerprint stable
   * across scans. Falls back to `lineStart` when no snippet is available
   * (e.g. a dependency advisory has no line at all) — that fallback is a
   * known limitation: a pure line-number anchor will produce a new
   * fingerprint if the surrounding code shifts.
   */
  evidenceText?: string;
  lineStart?: number;
}

/**
 * Produces a stable fingerprint so the same underlying issue isn't
 * recreated as a new Finding on every scan (Section 15/16). Deterministic:
 * identical input always yields the identical fingerprint.
 */
export function computeFingerprint(input: FingerprintInput): string {
  const stabilityAnchor =
    input.evidenceText ?? (input.lineStart !== undefined ? String(input.lineStart) : "");
  const key = [
    input.source,
    input.category,
    input.filePath ?? "",
    input.symbol ?? "",
    stabilityAnchor,
  ].join("::");
  return createHash("sha256").update(key).digest("hex");
}
