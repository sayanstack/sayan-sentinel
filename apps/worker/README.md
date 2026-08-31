# @sayan-sentinel/worker

BullMQ job processors tying the whole deterministic + AI scan pipeline together.

**Status:** the orchestration logic (`runScanPipeline`) is implemented and tested with injected fakes. The real BullMQ `Queue`/`Worker` wiring is genuine code but has not been run against a live Redis — none is available in this environment (no Docker, no local Redis).

## What's here

`src/pipeline/run-scan-pipeline.ts` — clone → walk files → build code
graph → run every configured scanner (Semgrep/Gitleaks/OSV-Scanner) →
correlate findings → compute the Sentinel Security Score → evaluate
repository policy → optionally AI-analyze the highest-severity findings.
Every dependency is injected, so this is tested without a real git
binary, real scanners, a real AI provider, or Redis.

`src/queue/` — the real BullMQ `Queue` (producer side, for `apps/api` to
enqueue jobs onto once it wires up scan-triggering) and `Worker`
(consumer side, built from real config — real scanner adapters, the real
AI provider factory, `DEFAULT_POLICY_RULES`).

## Not yet wired

Persisting scan/finding results to the database (no findings-persistence
layer exists yet, so every scan currently treats every finding as freshly
"open" with no history — documented in the pipeline's own code), and the
remediation/patch/PR workflow.

## Testing

```bash
pnpm --filter @sayan-sentinel/worker test
```

## Running (requires Redis)

```bash
pnpm --filter @sayan-sentinel/worker build
pnpm --filter @sayan-sentinel/worker start
```
