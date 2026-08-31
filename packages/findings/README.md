# @sayan-sentinel/findings

Canonical Finding model, stable fingerprinting, cross-detector correlation, and the Sentinel Security Score.

**Status:** all of the above implemented. See [../../docs/implementation-plan.md](../../docs/implementation-plan.md) for detail.

## What's here

- `FindingDraft` / `FindingEvidenceDraft` — the shape a scanner adapter
  produces before a repository/scan/status context exists.
- `computeFingerprint()` — anchors on the matched snippet text when
  available (stable across line-number drift caused by unrelated edits),
  falling back to line number only when no snippet exists.
- `correlateFindings()` — merges drafts from multiple detectors describing
  the same issue into one `CorrelatedFinding` with a `detectedBy` list,
  instead of one Finding per detector.
- `computeSecurityScore()` — the Sentinel Security Score: a documented,
  deterministic 0-100 formula over open findings (see the function's doc
  comment for the exact weights).

## Testing

```bash
pnpm --filter @sayan-sentinel/findings test
```
