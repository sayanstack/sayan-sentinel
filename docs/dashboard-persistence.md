# Scan Result Persistence

A real, pre-existing gap discovered during this run: `apps/api`'s
dashboard service (`prisma.scan.count`, `prisma.finding.findMany`) has
read from the `Scan`/`Finding` tables since an earlier phase, but no
code anywhere ever wrote to them — every scan pipeline computed its
result in-memory and returned it from the BullMQ job, so a real
dashboard would always have shown zero scans and zero findings no
matter how much scanning actually happened. This was fixed, not worked
around.

## What was built

`apps/worker/src/persistence/persist-scan-result.ts` — `persistScanResult`
writes one `Scan` row per completed job (`repositoryId`, `commitSha`,
`trigger`, `status: COMPLETED`, `securityScore`, `durationMs`), then
upserts one `Finding` row per `CorrelatedFinding`, keyed by the existing
`(repositoryId, fingerprint)` unique constraint — the same fingerprint
`computeFingerprint` already produces, so a finding re-detected across
scans updates in place instead of duplicating.

**A human's triage decision survives a re-scan.** The `update` branch of
the upsert never touches `status` — only a freshly-created `Finding` row
gets `status: OPEN`. A finding a human has already marked
`false_positive`/`resolved`/`accepted_risk` keeps that status on every
later scan, even though the detector still reports it every time.
Severity/confidence/description/remediation _do_ refresh on every scan,
since those are detector-computed properties, not human judgments.

**Evidence rows are replaced, not accumulated.** A finding's old
`FindingEvidence` rows are deleted before this scan's evidence is
inserted, so the evidence list reflects the latest scan rather than
growing an unbounded history of every past detection across every scan
that ever ran.

## Wiring

`apps/worker/src/queue/scan-worker.ts`'s BullMQ consumer calls
`persistScanResult` after `runFullStackScanPipeline` completes, but only
when `job.data.repositoryId` is present (two new optional fields on
`ScanJobData`: `repositoryId`, `trigger`). A job with no `repositoryId`
— e.g. an ad-hoc scan of an unregistered clone — still runs the full
scan and returns its result from the job; it's just never written to a
repository's row, since there isn't a real one to write it against. This
mirrors the same "degrade gracefully, never guess" principle the rest of
the pipeline follows.

## What's still NOT here

No `ScanJob` sub-rows are written (the schema has a `ScanJob` model for
per-phase job tracking — `INGESTION`, `RULES_ENGINE`,
`SOURCE_RUNTIME_CORRELATION`, etc. — but nothing populates it yet, so
there's no per-phase progress visible in the DB, only the final result).
No resolved-finding detection: a finding that stops being reported (the
underlying issue was actually fixed) is never automatically transitioned
to a resolved-like status — it just stops having its `lastSeenScanId`
updated, silently going stale rather than being flagged as "no longer
observed." No `AIUsage` rows are written even though AI analysis runs.
No route-correlation or web-crawl data is persisted at all — only
`correlatedFindings` make it to the database; `web.crawl`,
`routeCorrelation`, and `code.graph` exist only in the job's in-memory
return value and are lost once the job completes (this is what an
Application Graph / Attack Surface page would need persisted to show
real historical data, and doesn't have it yet).

## Testing

5 tests in `persist-scan-result.test.ts`, mocking `@sayan-sentinel/database`
directly (the first code in `apps/worker` to touch Prisma, since the
pipeline functions are deliberately DB-independent): Scan row creation
with the correct computed fields, Finding upsert with correct enum
mapping, the "status is never touched on update" guarantee (asserted by
checking the actual call arguments don't contain the key at all, not
just that it wasn't changed), evidence replacement instead of
accumulation, and multiple findings each getting their own upsert call.
