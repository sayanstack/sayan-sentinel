# Full Stack Scan

`runFullStackScanPipeline` (`apps/worker/src/pipeline/run-full-stack-scan-pipeline.ts`)
is the orchestration this project's Source-to-Runtime positioning depends
on: the existing code scan, unchanged, plus — only when a verified,
deployed web target is supplied — a bounded crawl, passive web analysis
of every discovered page, and source-to-runtime route correlation, with
both findings sets combined into one list and one recomputed Security
Score.

## What it actually does

1. Runs the existing `runScanPipeline` (clone → code graph → every
   configured scanner, including the Sentinel Rules Engine → correlation
   → score → policy → optional AI) completely unmodified.
2. Extracts source routes from the same repository using
   `@sayan-sentinel/rules-engine`'s real AST-based route extractor
   (Express/NestJS/Next.js App Router) — not the coarser `code-intelligence`
   graph, which doesn't understand Next.js routing.
3. **Only if `input.webTarget` is supplied** (a verified `TargetAuthorization`,
   converted to `SafeHttpClientOptions` via `apps/api/src/targets/
to-scope-guard-record.ts`): runs `BoundedCrawler` against the target,
   then runs the full Web Security Engine (`scanUrl`, including the CORS
   probe) against every page the crawl discovered.
4. Correlates every crawled runtime path against the extracted source
   routes via `@sayan-sentinel/source-runtime-correlation`, producing a
   `routeCorrelation` result: which runtime requests matched a source
   route (with extracted path parameters), which didn't, and which source
   routes were never observed at runtime.
5. Independently correlates the web findings among themselves
   (`correlateFindings`, same function the code side already uses),
   concatenates them with the code side's already-correlated findings,
   and recomputes the Security Score over the combined list.

Without a web target, steps 3 is skipped, and `routeCorrelation` still
reports every source route as trivially unmatched (nothing was observed
at runtime this scan) — the result degrades gracefully to a code-only
scan, never a fabricated web result.

## Two honestly-documented limitations, not hidden gaps

**No cross-layer finding correlation.** A `SENTINEL-AUTHZ-001` finding
from the Rules Engine and a "missing auth header observed" web finding
about the _same endpoint_ are never merged into one entry. This is a
direct consequence of `computeFingerprint` baking the detector `source`
into the fingerprint hash by design (so two different detectors never
silently look like the same finding by accident) — a `rules_engine`
fingerprint and a `web_security` fingerprint can never collide. True
cross-layer correlation would need to key on the _route_ (via
`routeCorrelation.matched`, which already has the linkage) rather than
the finding fingerprint. That linkage is surfaced for a human — or a
future correlation pass — to use; it is not automated in this pass.

**The repository is cloned and walked twice** — once inside
`runScanPipeline`, once here to extract source routes — because
`runScanPipeline`'s existing return type doesn't expose the workspace
directory, and changing that contract would touch every existing
caller/test of a function that already works correctly. `cloneRepository`/
`walkRepositoryFiles` are injected dependencies, so this only means a
repeated real `git clone` in production, not a repeated network call in
every test (all four pipeline tests run against a real local temp
directory with a real fixture file, exercising the actual AST-based
route extraction rather than a mocked one).

## Worker wiring

`apps/worker/src/queue/scan-worker.ts`'s BullMQ consumer now calls
`runFullStackScanPipeline` unconditionally — an ordinary code scan and a
Full Stack Scan are the _same_ code path, distinguished only by whether
`job.data.webTarget` is present (a new optional field on `ScanJobData`).
This was a deliberate design choice: keeping one pipeline function means
there's no risk of a code-only path and a full-stack path drifting apart
into separately-maintained implementations. Still unexercised against a
live Redis/BullMQ in this environment, per the same honesty note every
other queue-touching code in this project carries.

## What's still NOT here

No job type split (`WEB_SCAN`/`FULL_STACK_SCAN` as distinct
`ScanJobType` enum values exist in the schema now, but nothing writes a
`ScanJob` row of those types yet — no `ScanJob`/`Scan` persistence is
wired to this pipeline at all), no dashboard surface for a Full Stack
Scan's result, no Application Graph, no Attack Surface page, and no
automatic enqueueing of a Full Stack Scan when a repository has a linked,
verified deployment (a human/API caller has to construct the
`webTarget` input and enqueue the job themselves today).

## Testing

4 tests in `run-full-stack-scan-pipeline.test.ts`: a code-only scan
(routes extracted, all reported unmatched, perfect score with no
scanners), and a web-target scan (web findings merged with
`primarySource: "web_security"`, a crawled runtime path correctly
matched against the source route with its path parameter extracted, an
unmapped runtime path correctly reported unmatched, and the combined
score genuinely lower than a clean scan). Route extraction runs against
a real temporary directory with a real Express-style fixture file — not
a mocked file system — so the test exercises the actual `ts-morph`-based
AST parsing, not an assumption about what it would find.
