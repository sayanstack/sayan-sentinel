# @sayan-sentinel/findings

Canonical Finding model and stable fingerprinting.

**Status:** model + fingerprinting implemented. Correlation engine (merging evidence from multiple detectors into one Finding) is Phase 8 and not yet built — see [../../docs/implementation-plan.md](../../docs/implementation-plan.md).

## What's here

- `FindingDraft` / `FindingEvidenceDraft` — the shape a scanner adapter
  produces before a repository/scan/status context exists.
- `computeFingerprint()` — anchors on the matched snippet text when
  available (stable across line-number drift caused by unrelated edits),
  falling back to line number only when no snippet exists.

## Testing

```bash
pnpm --filter @sayan-sentinel/findings test
```
