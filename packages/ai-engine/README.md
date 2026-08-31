# @sayan-sentinel/ai-engine

Provider-agnostic AI reasoning layer: Anthropic / OpenAI / local OpenAI-compatible endpoints, schema-validated structured output, and the Section 14 prompt-injection defenses.

**Status:** implemented, but **not exercised against a live model** — no AI credentials are configured in this environment (`AI_PROVIDER=none` by default). Everything here is real code against verified current SDK APIs, tested via a fake provider double for the logic that doesn't require a live model.

## Design

- Repository-derived content is always redacted for pattern-matched
  secrets (`redactSecretsInText`) and wrapped in explicit
  `===BEGIN/END UNTRUSTED REPOSITORY CONTENT===` markers
  (`wrapUntrustedContent`) before it's ever sent. `buildSystemPreamble`
  keeps Sentinel's own instructions clearly separated from and prioritized
  over that content.
- `detectPromptInjectionAttempt` flags suspicious phrasing for audit — it
  never blocks or alters a call by itself. The real defense is
  architectural: `completeStructured` only ever returns schema-validated
  data, never the model's raw text, and nothing the model says triggers a
  tool call directly.
- `BudgetGuard` rejects a call whose estimated cost would exceed the
  per-scan or monthly budget _before_ the call is made.

## Task-specific schemas

- `findingAnalysisSchema` + `buildFindingAnalysisPrompt` — false-positive
  judgment and remediation suggestion for a single finding.
- `patchSuggestionSchema` + `buildPatchSuggestionPrompt` — generates a
  complete proposed file content fixing a finding, used by
  `apps/worker/src/remediation`.

## Not yet built

PR security review (Section 25) as its own schema/prompt pair.

## Testing

```bash
pnpm --filter @sayan-sentinel/ai-engine test
```
