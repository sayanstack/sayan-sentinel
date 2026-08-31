# Implementation Plan

This document tracks the real build status of Sayan Sentinel against the
phased plan. It is updated as phases complete — nothing here is marked done
until it genuinely works (builds, runs, and is tested).

Status legend: `not started` · `in progress` · `done`

| Phase | Scope                                                                                       | Status                                                                   |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1     | Repository inspection                                                                       | done                                                                     |
| 2     | Dependency/API research (GitHub App, Semgrep, Gitleaks, OSV-Scanner, HexStrike MCP surface) | done                                                                     |
| 3     | This plan                                                                                   | done                                                                     |
| 4     | Monorepo scaffold, root tooling, contracts                                                  | done                                                                     |
| 5     | Foundational backend (NestJS API skeleton, health/readiness, config, logging)               | done                                                                     |
| 6     | Repository ingestion + code intelligence (AST graph)                                        | done                                                                     |
| 7     | Deterministic security engine (Semgrep/Gitleaks/OSV-Scanner adapters)                       | done                                                                     |
| 8     | Findings model + correlation engine                                                         | done                                                                     |
| 9     | AI engine (provider abstraction, schema-validated reasoning)                                | done                                                                     |
| 10    | Scope Guard                                                                                 | done                                                                     |
| 11    | HexStrike AI adapter (real interface)                                                       | done                                                                     |
| 12    | GitHub App integration                                                                      | done                                                                     |
| 13    | Policy engine + worker job pipeline                                                         | done                                                                     |
| 13b   | Remediation / patch / PR workflow (patch generation, approval, PR creation)                 | done                                                                     |
| 14    | Frontend (Next.js, dashboard, code graph, findings)                                         | in progress (2 of 10 nav pages real; rest are honest placeholders)       |
| 15    | Vulnerable demo fixture                                                                     | done                                                                     |
| 16    | Tests + security regression suite                                                           | done                                                                     |
| 17    | Docker / CI                                                                                 | done (Dockerfiles/CI unbuilt-locally — no Docker engine here; see notes) |
| 18    | Documentation                                                                               | done                                                                     |
| 19    | Full audit                                                                                  | done                                                                     |
| 20    | Sentinel Rules Engine (AST/call-graph/taint-based SAST, no AI required)                     | done — see notes below                                                   |
| 21    | Scope Guard V2 hardening + Target Authorization verification primitives                     | done — see notes below                                                   |
| 22    | Web Security Engine: SafeHttpClient + 5 passive rules                                       | done — see notes below                                                   |
| 23    | Source-to-Runtime Correlation: route normalization + path matching                          | done — see notes below                                                   |
| 24    | Target Authorization API (create/verify/list/revoke)                                        | done — see notes below                                                   |
| 25    | Web Discovery Engine: bounded crawler (robots.txt, sitemap.xml, forms)                      | done — see notes below                                                   |
| 26    | API Security Engine: OpenAPI import + endpoint inventory + SENTINEL-API-1xx                 | done — see notes below                                                   |
| 27    | Full Stack Scan orchestration + worker pipeline wiring                                      | done — see notes below                                                   |
| 28    | Web Targets dashboard UI (real, browser-verified)                                           | done — see notes below                                                   |
| 29    | Scan result persistence (fixed a real pre-existing gap)                                     | done — see notes below                                                   |
| 30    | Hosted-mode config interlocks (SENTINEL_HOSTED_MODE)                                        | done — see notes below                                                   |
| 31    | GitHub Check Run reporting wired into the scan worker                                       | done — see notes below                                                   |

## Phase 31 — GitHub Check Run reporting

Full writeup in [docs/github-app.md](github-app.md#github-check-runs-scan-status-reporting).
`GitHubAppClient.createCheckRun` has existed since Phase 12 but a grep
across the whole codebase (`grep -rln "createCheckRun" apps/ packages/
--include="*.ts" | grep -v test | grep -v dist`) turned up only its own
definition — it had never been called from anywhere. A real, previously
unnoticed gap, not on the original list, fixed for the same reason as
the Phase 29 persistence gap: shipping new orchestration on top of a
method nobody calls would mean the "PR workflow" story stays silently
broken underneath.

**Built**: `apps/worker/src/github/build-check-run-summary.ts` —
`buildCheckRunSummary(headSha, result: FullStackScanResult)` — formats a
completed scan into a `CheckRunParams` (Security Score, a per-severity
markdown table computed from the actual `correlatedFindings`, ✅/❌ derived
directly from `policyResult.passed` — never from an invented score
threshold — an optional web-scan summary line when `result.web` is
present, and the real policy violation messages on failure). `ScanJobData`
(`apps/worker/src/queue/queue-names.ts`) gained an optional `github?:
{installationId, owner, repo}` field, following the same "present → do
the thing, absent → skip, never guess" pattern already used for
`repositoryId` and `webTarget`. The per-job work in
`apps/worker/src/queue/scan-worker.ts` was factored out into an exported
`processScanJob()` so it's unit-testable without a live Redis connection
(the `Worker` construction itself remains untested, matching the
pre-existing state — `startScanWorker` requires a reachable Redis this
environment doesn't have). A `GitHubAppClient` is built once at
worker-startup from the same three env vars `deriveFeatureFlags` already
uses to compute `githubAppEnabled` (`GITHUB_APP_ID`,
`GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_WEBHOOK_SECRET`) — `null` when any
are missing. A Check Run failure (rate limit, revoked installation) is
caught and swallowed: reporting status is a side effect of a completed
scan, never a precondition for one. 5 new tests in
`scan-worker.test.ts` cover: no client → no call, client + no
`job.data.github` → no call, both present → correct
`(installationId, owner, repo, summary)` call, API rejection doesn't
propagate, and persistence still runs independent of GitHub reporting.

**Explicitly deferred / not built in this phase**: nothing yet opens or
comments on pull requests from this new wiring — that remains the
existing Phase 13b remediation-PR workflow (`apply-approved-patch`,
`generate-patch`), which is a separate, human-approval-gated path,
distinct from the Check Run this phase reports automatically on every
scan. Nothing in `apps/api` receives GitHub webhooks or enqueues a scan job at
all yet (confirmed: no `webhook` route, no `ScanJobData`/queue reference
anywhere under `apps/api/src`) — so no job in this codebase currently
gets `github` populated end-to-end from a real `push`/`pull_request`
event. That receiver-and-enqueue path is still `not started`; this phase
only makes the worker capable of reporting a Check Run once a job
carries that field, not the population of the field itself.

## Phase 30 — Hosted-mode config interlocks

Full writeup in [docs/hosted-security-model.md](hosted-security-model.md).
Most of what "hosted mode" typically needs was already true
unconditionally in this codebase (mandatory verification/expiration,
private-network blocking, Tier 2/3 unimplemented everywhere, always-on
audit logging) — this phase adds the narrower set of things that
legitimately need to differ between a trusted self-hosted operator and
an anonymous multi-tenant hosted deployment.

**Built**: `SENTINEL_HOSTED_MODE` in `packages/config`, enforced via a
Zod `.superRefine()` cross-field check at config-load time (not a
runtime warning — the process fails to start): cannot be combined with
`LOCAL_LAB_MODE=true` (would let a hosted user reach private
infrastructure), and cannot be combined with a
`DYNAMIC_VALIDATION_MAX_TIER` above 1 (a forward-looking guard — Tier
2/3 don't exist yet, but the schema already accepts higher values for a
future self-hosted operator, and hosted mode caps it regardless so that
capability can never ship enabled for anonymous use by accident).
`features.hostedMode` derived alongside the existing feature flags. 7
new tests, including confirming a self-hosted (non-hosted-mode)
deployment is unaffected by either restriction.

**Explicitly deferred**: no per-request/per-IP API rate limiting, no
tenant-level quota enforcement — this is a config-time interlock on the
two settings that matter, not a runtime firewall.

## Phase 29 — Scan result persistence

Full writeup in [docs/dashboard-persistence.md](dashboard-persistence.md).
This wasn't on the original punch list — it was **discovered** while
scoping the Attack Surface page: `apps/api`'s dashboard service has read
`prisma.scan`/`prisma.finding` since an earlier phase, but nothing in
the codebase ever wrote to those tables. Every scan (the original
`runScanPipeline` and this run's `runFullStackScanPipeline` alike)
computed its result in-memory and returned it from the BullMQ job only —
a real dashboard would always have shown zero scans and zero findings.
Flagging and fixing this rather than building a new UI on top of a
foundation that silently couldn't work.

**Built**: `persistScanResult` (`apps/worker/src/persistence/`) writes a
real `Scan` row and upserts `Finding` rows keyed by the existing
`(repositoryId, fingerprint)` constraint. A human's
false-positive/resolved/accepted-risk triage decision survives a
re-scan (the update path never touches `status`); evidence rows are
replaced rather than accumulated across scans. Wired into
`scan-worker.ts` — persistence runs whenever the job carries a
`repositoryId` (two new optional `ScanJobData` fields:
`repositoryId`, `trigger`), and is skipped (not guessed) otherwise. 5
tests, the first in `apps/worker` to mock `@sayan-sentinel/database`
directly.

**Explicitly deferred**: no `ScanJob` per-phase sub-rows, no
resolved-finding detection (a finding that stops being reported just
stops updating, rather than being flagged as no-longer-observed), no
`AIUsage` rows, and — the piece that actually blocks a real Attack
Surface / Application Graph page — no persistence of `web.crawl`,
`routeCorrelation`, or `code.graph` at all; only `correlatedFindings`
survive past the job's in-memory return value today.

## Phase 28 — Web Targets dashboard UI

The first dashboard page connected to this run's new backend work.
Full writeup in [docs/target-authorization.md](target-authorization.md).

**Built**: `apps/web`'s `/targets` page — a Server Component that fetches
organizations and targets and renders the honest `ErrorBanner` state when
the API is unreachable (verified in a real browser: correctly showed
"Couldn't load targets" with no API running, not a crash), plus a Client
Component (`TargetsView`) for creating/verifying/revoking a target,
including surfacing the raw DNS TXT/HTTP well-known challenge value
inline for a pending target. Added `GET /organizations` to `apps/api`
(a small new endpoint reusing the existing `MembershipLookupService`)
since the create-target form needs an organization to submit against —
2 new tests. Activated the dev server and drove the page in the actual
Browser pane (not just `tsc`/build) before calling this done, per this
session's own UI-verification standard; also ran a real production
`next build` to catch build-time errors a dev server wouldn't surface.

**Explicitly deferred**: no Scan History page, no Full Stack Scan result
view, no Application Graph, no Attack Surface page — this is one real
page, not a dashboard overhaul.

## Phase 27 — Full Stack Scan orchestration

Full writeup in [docs/full-stack-scan.md](full-stack-scan.md). This is
the integration point every prior phase in this run was building toward.

**Built**: `runFullStackScanPipeline` in `apps/worker` — the existing
code scan pipeline unchanged, plus (only with a verified web target)
`BoundedCrawler` + full `scanUrl` analysis of every discovered page +
real source-to-runtime route correlation (via
`source-runtime-correlation`, using `rules-engine`'s actual AST route
extractor, not the coarser `code-intelligence` graph). Added
`"web_security"`/`"api_security"` to the shared `FindingSource`
vocabulary (mirroring the earlier `"rules_engine"` addition) and a
`webFindingToDraft` mapper so web findings flow through the same
`correlateFindings`/`computeSecurityScore` pipeline the code side uses.
Wired into the real BullMQ worker (`scan-worker.ts`) — every job now
runs through this one pipeline, distinguished only by whether
`job.data.webTarget` is present, so a code-only path and a full-stack
path can't drift into separately-maintained implementations. 4 tests,
run against a real temporary directory with a real fixture file (genuine
AST route extraction, not a mocked file system).

**Two limitations documented rather than hidden**: no cross-layer
finding correlation (a code finding and a web finding about the same
endpoint are never merged into one entry — `computeFingerprint` bakes
the detector source into the hash by design, so this needs a
route-keyed correlation pass that doesn't exist yet; `routeCorrelation`
already carries the linkage for a human or future pass to use), and the
repository is cloned/walked twice (once inside the existing
`runScanPipeline`, once here for route extraction) since changing that
function's return contract would touch every existing caller.

**Explicitly deferred**: no `ScanJob`/`Scan` persistence wired to this
pipeline (results aren't saved anywhere yet), no dashboard surface, no
Application Graph, no Attack Surface page, and no automatic enqueueing
when a repository has a linked deployment — a caller constructs
`webTarget` and enqueues the job manually today.

## Phase 26 — API Security Engine

Full writeup in [docs/api-security-engine.md](api-security-engine.md).

**Built**: `packages/api-security-engine` — OpenAPI/Swagger JSON/YAML
import (`yaml` package; the one non-"dependency-free-by-design" addition
in this run of phases, since parsing a defined interchange format isn't
part of the trust boundary the project keeps hand-rolled elsewhere), an
endpoint inventory that cross-references declared vs. observed endpoints
by reusing `@sayan-sentinel/source-runtime-correlation`'s matcher (an
OpenAPI path's `{param}` is substituted with a literal placeholder,
turning it into a "concrete path" the existing matcher already knows how
to compare against another pattern — no second matching implementation),
and 4 rules: `SENTINEL-API-101` (undocumented endpoint), `102`
(documented-but-unobserved, `info` only), `103` (auth-requirement
mismatch — only fires when the document demonstrably requires auth
elsewhere, avoiding noise on an all-public API), `104` (resource-ID-
shaped path parameter, informational, meant for cross-referencing against
the Rules Engine's `SENTINEL-AUTHZ-001`). 23 tests.

**Explicitly deferred**: no GraphQL introspection, no safety-tier scan-
plan generation, no automated cross-referencing between API-104 and
actual AUTHZ-001 findings (a human has to do that today), and no
job-pipeline/dashboard wiring.

## Phase 25 — Web Discovery Engine (bounded crawler)

Full writeup in [docs/web-security-engine.md](web-security-engine.md).

**Built**: `BoundedCrawler` in `packages/web-security-engine/src/
discovery/` — same-origin-only, budget-bounded (depth/pages/duration),
built entirely on the existing `SafeHttpClient` so every fetch is already
Scope-Guard-checked. Respects `robots.txt` `Disallow` rules by default
(a courtesy on top of, not instead of, the authorization boundary),
seeds additional discovery from `sitemap.xml`, extracts links/scripts/
forms via dependency-free regex-based parsing (documented limitation:
under-discovers on malformed markup or client-rendered SPAs — a
completeness gap, never a safety one, since every found URL still goes
through Scope Guard before being requested), and never auto-submits a
discovered form. 40 new tests (73 total in the package now).

**Explicitly deferred**: no OpenAPI/GraphQL discovery, no authenticated
crawling, and no job-pipeline wiring — nothing in `apps/worker` calls
this crawler yet as a real scan job.

## Phase 24 — Target Authorization API

Full writeup in [docs/target-authorization.md](target-authorization.md).
The `TargetAuthorization` Prisma model and `evaluateScopeGuard` already
existed from earlier phases; this phase built everything between them.

**Built**: `apps/api/src/targets/` (controller + service, full CRUD
lifecycle with tenant isolation matching `RepositoriesService`'s
established pattern), the first working use of the `AuditEvent` table
(`write-audit-event.ts` — the model existed but nothing wrote to it
before now), activation of NestJS's global `ValidationPipe` (`class-
validator` was a declared-but-unused dependency), and
`to-scope-guard-record.ts` — converts a persisted row into
`evaluateScopeGuard`'s input shape, verified by actually calling the real
Scope Guard function against it (accepts a verified target, rejects a
revoked one) rather than asserting the shapes merely look compatible.
Added the missing `verificationChallenge` field to the schema so a
challenge generated at target-creation time has somewhere to live until
verification runs. 13 new tests.

**Explicitly deferred**: no background re-verification-on-expiry job, no
UI, no worker-job wiring that actually looks up a target by ID for a real
scan (the pieces exist independently — Target Authorization API, Scope
Guard, SafeHttpClient — but nothing yet chains them together end to end
in a job), and `OWNERSHIP_CONFIRMATION` remains schema-only with no
verification primitive.

## Phase 23 — Source-to-Runtime Correlation

New `packages/source-runtime-correlation`, the piece Spec B names as its
own flagship feature. Full writeup in
[docs/source-runtime-correlation.md](source-runtime-correlation.md).

**Built**: a dependency-free `NormalizedRoute`/matching core —
`normalizeColonParams` (Express/NestJS), `normalizeNextAppRouterPath`
(Next.js App Router, including catch-all segments and route-group
stripping), and `correlateRuntimeRequest`, which matches a concrete
runtime request against a set of source routes with specificity-based
ranking (a literal route like `/users/me` correctly outranks
`/users/{id}` for that path) and explicit ambiguity detection when two
routes tie. Proven with a real cross-package integration test: routes
extracted by `@sayan-sentinel/rules-engine`'s actual `ts-morph` parser
(Express, NestJS, Next.js fixtures) are converted to `NormalizedRoute[]`
and correlated against synthetic runtime paths — not just tested against
hand-written pattern strings. 37 tests total.

**Explicitly deferred**: no `RepositoryDeployment` entity/persistence, no
runtime-endpoint discovery of its own (needs a Web Discovery Engine or
OpenAPI import this session didn't build), and no Full Stack Scan/
Application Graph/dashboard wiring. This is the matching engine, proven
against real source-side data — not an end-to-end feature yet.

## Phase 22 — Web Security Engine (SafeHttpClient + passive rules)

New `packages/web-security-engine`. Full writeup in
[docs/web-security-engine.md](web-security-engine.md) — summary here.

**Built**: `SafeHttpClient`, the centralized HTTP client the Source-to-
Runtime spec requires every web rule to share — enforces the method
allowlist, Scope Guard (re-checked on **every redirect hop**, closing the
"redirect escape" gap `scope-guard.ts` documents as a caller
responsibility), a timeout, a bounded redirect count, and a response-size
cap enforced during transfer for a real streaming response. `Set-Cookie`
headers are collected separately from ordinary headers (multiple cookies
can't be safely comma-joined — `Expires` values contain commas
themselves) using the standardized `Headers.getSetCookie()`. 5 passive
rules on top of it: `SENTINEL-WEB-001` (CORS — actually probes with a
synthetic Origin header and checks for reflection, not just a static
header read), `002`/`003` (cookie Secure/HttpOnly, name-based severity so
a session cookie is weighted higher than a preference cookie), `004`
(debug/stack-trace signature detection across 7 frameworks/languages),
`006` (missing HSTS). 33 tests, all against injected fakes.

**Explicitly deferred**: `SENTINEL-WEB-005`/`007`, the bounded crawler/
discovery engine, form/script/API discovery, TLS/mixed-content analysis,
technology fingerprinting, `packages/api-security-engine/`, OpenAPI
import, authenticated scans, `TargetAuthorization` persistence (callers
must supply the authorization list directly — no DB-backed create/lookup
exists), and any job-pipeline/dashboard wiring. This is a tested
foundation, not a usable end-to-end web scan.

## Phase 21 — Scope Guard hardening + Target Authorization verification

Picking up the Source-to-Runtime spec's Scope Guard V2 / Target
Authorization v2 requirements, scoped to what's tractable without a
persistence layer (no `TargetAuthorization` DB model or API exists yet —
see Phase 20's deferral note, which applies here too).

**Found and fixed a real Scope Guard bug**, not a hypothetical one:
verified empirically (`node -e`, not assumed) that `new URL("http://[::1]/").hostname`
returns `"[::1]"` with brackets attached, and `net.isIP("[::1]")` returns
`0`. This meant an IPv6-literal URL bypassed `evaluateScopeGuard`'s
fast-path localhost check (`"[::1]" !== "::1"`) and caused
`resolveAndCheckHost` to attempt a DNS lookup of the bracketed string
instead of recognizing it as a literal IP directly. It happened to still
end up blocked on this system only because the OS resolver's
`dns.lookup` tolerated and re-normalized the bracketed input — not a
property to depend on across platforms. Fixed by stripping the brackets
before any hostname comparison. Fixing _that_ surfaced a second, related
gap: with brackets stripped, an IPv4-mapped IPv6 literal like
`[::ffff:127.0.0.1]` is checked as the literal address `::ffff:7f00:1`
(the hex-hextet form `net.isIP` produces) rather than being DNS-resolved
first — and the existing `isBlockedIPv6` only recognized the
dotted-decimal form (`::ffff:127.0.0.1`), not hex-hextet, so this
specific bypass would have sailed through undetected after the first fix
alone. Fixed `isBlockedIPv6` to recognize both forms. 3 regression tests
added (`scope-guard.test.ts` x2, `ip-blocklist.test.ts` x1).

**New**: `packages/hexstrike-adapter/src/target-verification/` — DNS TXT
and HTTP well-known domain-ownership verification (the ACME DNS-01/
HTTP-01 pattern), with the HTTP method routed through the same
SSRF-safety check Scope Guard itself uses before ever connecting, and
never following redirects. 17 tests, all against injected fakes (no real
DNS/HTTP calls in the suite). Full writeup in
[docs/scope-guard.md](scope-guard.md).

**Explicitly deferred**: no `TargetAuthorization` persistence model,
Prisma schema, or API/CRUD endpoints exist yet to actually create,
re-verify-on-expiry, or revoke a target authorization — these are pure,
tested verification _primitives_ a future persistence layer calls, not a
complete workflow. `packages/web-security-engine/` (SafeHttpClient,
discovery, passive web rules), `packages/api-security-engine/`, and
everything downstream of those in Spec B remain unstarted.

## Phase 20 — Sentinel Rules Engine

Delivered `packages/rules-engine`: a first-party, fully offline static
analysis engine per the "SENTINEL RULES ENGINE" specification the user
provided. Full architecture, rule catalog, taint/authorization design,
self-scan results, and documented limitations are in
[docs/rules-engine.md](rules-engine.md) — not duplicated here.

**Scope actually delivered** (of the ~67-section spec): the core engine
(AST analysis via `ts-morph`, interprocedural call graph via the
TypeScript checker, CFG guard-dominance, a SOURCE→TRANSFORM→SINK taint
engine with a sanitizer-vs-validator distinction enforced per sink
category), the Authorization Analyzer (the explicitly-requested flagship
capability), 8 rules (`SENTINEL-AUTHZ-001`/`004`, `SENTINEL-INJ-001`/`002`/
`003`, `SENTINEL-FS-001`, `SENTINEL-SSRF-001`, `SENTINEL-DATA-001`),
Express/NestJS/Next.js framework support, confidence scoring, evidence-
first findings with full traces, a CLI (`sentinel scan` with table/json/
sarif output and documented exit codes 0/1/2), SARIF output, inline
suppressions with mandatory reasons, per-rule config overrides,
correlation-pipeline integration (new `rules_engine` finding source,
`RulesEngineScannerAdapter` wired into `apps/worker`'s scan pipeline),
33 tests (true/false-positive fixtures, three adversarial AUTHZ-001
cases, suppression/config tests), and a genuine self-scan against this
repository that found and fixed one real false positive.

**Explicitly deferred, not faked**: `SENTINEL-AUTHZ-002`/`003`,
`SENTINEL-AUTHN-*`, `SENTINEL-API-*`, `SENTINEL-DATA-002`/`003`, JWT/
crypto/CORS/webhook-specific rules, baseline-mode diffing beyond the CLI's
basic fingerprint-set comparison, incremental (changed-files-only)
analysis, a dedicated benchmark harness, and a Rule Explorer UI page (no
frontend page reads from the Rule Registry yet). The architecture places
no obstacle in front of adding any of these — the taint engine, call
graph, and confidence model are reused by every rule, not rebuilt per
rule — but implementing all ~30 rules named in the original specification
to the same depth as AUTHZ-001 was not realistic within this session
alongside the verification/self-scan/documentation work the spec itself
requires before calling any of it done.

The much larger, separately-specified "SOURCE-TO-RUNTIME APPLICATION
SECURITY PLATFORM" follow-on (Target Authorization v2, Web/API Security
Engines, source-to-runtime correlation, Application Graph, Sentinel Lab,
Live Demo hosting) was **not started** in this session — it is an
independently multi-week scope on top of the above, and starting it
without the runway to also verify/self-scan/document it to the same
standard risked producing exactly the "explain the architecture instead
of building it" outcome both specs explicitly rule out. It remains fully
specified and ready to pick up.

## Phase 2 research notes (to date)

- **GitHub App vs. PAT**: confirmed — build as a GitHub App
  (`packages/github`), not a personal-access-token integration. Requires
  webhook secret verification (HMAC-SHA256 over raw body) and an app private
  key for JWT-based installation token minting.
- **Semgrep**: CLI is source-available under LGPL 2.1 as of recent releases —
  must be invoked as a subprocess (never linked into Sentinel's own process or
  vendored), output consumed as JSON. License audit tracked in
  `docs/licensing.md` (to be written in Phase 7).
- **Gitleaks**: MIT-licensed, subprocess invocation, JSON report output.
- **OSV-Scanner**: Apache-2.0, subprocess invocation, JSON report output
  against lockfiles/SBOM.
- **HexStrike AI**: the `hexstrike-ai` MCP server is available in this
  environment (tools prefixed `mcp__hexstrike-ai__*`, e.g. `nuclei_scan`,
  `httpx_probe`, `nmap_scan`, `server_health`). `packages/hexstrike-adapter`
  must be implemented against this _actual_ tool surface, not a guessed REST
  API — Phase 11 starts with an inventory of the real tool schemas before
  writing the `DynamicValidationProvider` implementation.
- **Node/pnpm/turbo/git** confirmed installed locally (Node 24.19.0, pnpm
  10.12.4, git 2.54.0). **Docker is not installed on this machine** (no
  `docker` binary, no `com.docker.service`) — confirmed via both the Bash and
  PowerShell shells. Flagged as an external setup item; `docker compose up`
  will not run here until Docker Desktop (or an equivalent engine) is
  installed. This does not block building or unit-testing the application
  code itself, but it does mean Postgres-backed integration tests and
  `prisma migrate dev` cannot be exercised against a live database in this
  environment until Docker (or a local Postgres install) is available.

## Phase 4 completion notes

Built, and verified with real command output (not assumed):

- Root tooling: `package.json` (pnpm workspaces + turbo scripts),
  `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`,
  `.env.example`, `docker-compose.yml` (Postgres/Redis/MinIO — app
  containers added once `apps/*` exist).
- `packages/shared`: branded IDs, severity/status/safety-tier vocabulary,
  `Result` type, pagination helpers. 9 unit tests, all passing.
- `packages/config`: zod-validated env schema mirroring `.env.example`,
  `loadConfig()` deriving `aiEnabled` / `githubAppEnabled` /
  `hexstrikeEnabled` feature flags so optional integrations fail closed
  into a "not configured" state rather than a crash or a fake success.
  6 unit tests, all passing.
- `packages/database`: full Prisma schema for the Section 32 data model
  (User, Organization, Membership, Installation, Repository, Scan, ScanJob,
  Finding, FindingEvidence, TargetAuthorization, DynamicValidation, Policy,
  Patch, PullRequest, AuditEvent, AIUsage) with explicit `organizationId` on
  every tenant-owned row for isolation, a unique `(repositoryId,
fingerprint)` constraint on `Finding` for stable dedup, and a seed script
  for local dev identity only (no fake repositories/scans/findings).
  `prisma generate` succeeds against the schema (verified); no live
  database is available yet to run migrations (see Docker note above).
- Verified end-to-end via Turborepo: `pnpm install`, `pnpm build`,
  `pnpm test` (15/15 passing across the 3 packages), `pnpm typecheck` all
  green.
- One real bug was caught by its own test and fixed during this phase:
  `clampLimit(0)` returned the default limit instead of clamping to 1,
  because `!limit` treats `0` as falsy.

## Module-system correction (post-Phase 4)

Switched `packages/shared`, `packages/config`, and `packages/database` from
ESM (`NodeNext`) to CommonJS across the whole workspace (`tsconfig.base.json`,
per-package `package.json`). NestJS's dependency injection depends on
`emitDecoratorMetadata`, and its Jest-based testing story, are both far more
reliable under CommonJS than ESM interop with a CJS-only ecosystem
(Jest/ts-jest, most Nest ecosystem packages). Re-verified after the switch:
build/test/typecheck green, and the compiled output loads correctly via
`require()`.

## Phase 5 completion notes

Built `apps/api` (NestJS) and verified with real command output:

- `SentinelConfigModule` — loads `@sayan-sentinel/config` once at boot,
  exposed via the `SENTINEL_CONFIG` DI token.
- Structured logging via `nestjs-pino`: per-request IDs (read from/echoed to
  `x-request-id`), and redaction of `authorization`, `cookie`, `set-cookie`,
  and common secret-shaped fields (`*.password`, `*.token`, `*.apiKey`,
  `*.privateKey`, etc.) before anything is logged — the Section 31/11 "never
  log secrets" requirement enforced at the transport layer, not by
  convention.
- `GET /health/live` — liveness, no dependency access.
- `GET /health/ready` — readiness via `@nestjs/terminus`'s current
  `HealthIndicatorService`/`HealthCheckService` API (inspected the installed
  package's actual `.d.ts` files before writing against it, rather than
  assuming the older `HealthIndicator` base-class API from older Terminus
  versions). Checks Postgres via a real `SELECT 1` through Prisma and pings
  Redis via a short-lived `ioredis` connection.
- Pinned `@nestjs/*` to the 11.2.x line, not the newly-released 12.0.1 —
  `@nestjs/terminus` and `nestjs-pino` both declare peer support only up to
  Nest 11; installing against 12 produced unmet-peer-dependency warnings.
- **Verified end-to-end, not just unit-tested**: with no Postgres or Redis
  running (this machine has neither Docker nor a local Postgres/Redis), the
  e2e suite boots the real Nest application and asserts `/health/ready`
  returns **503** with `database` and `redis` both explicitly `"down"`,
  carrying the real underlying errors (Prisma's actual
  `Can't reach database server at localhost:5432` and ioredis's actual
  `Connection is closed.`) — not a fabricated success and not a silent
  crash. `/health/live` still returns 200 in the same run, since it touches
  no dependency.
- 8 unit tests (health controller + both indicators, each asserting the
  down-path reports the real error) plus the e2e suite above, all passing.
  `pnpm lint` (0 errors/warnings), `pnpm typecheck`, and `pnpm build` are
  green across all 4 packages.
- Disabled `@typescript-eslint/consistent-type-imports` repo-wide: its
  autofix would rewrite a constructor-injected class to `import type`,
  which strips the runtime value `emitDecoratorMetadata` needs — that
  autofix would silently break NestJS dependency injection.

## Phase 6 completion notes

Built `packages/code-intelligence` — real repository ingestion and an
AST-based code graph, not stubs. Also added `packages/shared/src/redact.ts`
(credential/secret redaction utilities, since ingestion needed them
immediately and the AI engine will too — Sections 11/14/31).

**Ingestion** (`src/ingestion/`), treating repository content as untrusted
throughout:

- `git-ingestor.ts` — clones a single commit via a blobless partial clone
  (`--filter=blob:none`) fetching the exact SHA directly (GitHub supports
  this), with a shallow-branch-fetch fallback if the server refuses direct
  SHA fetch. Runs `git` via `execFile` with argument arrays (never a shell,
  so no command-injection surface), sets `GIT_LFS_SKIP_SMUDGE=1` and an
  empty `core.hooksPath` as defense-in-depth, and enforces a timeout per
  git subprocess. **Never executes anything from the repository** — only
  git plumbing commands run.
- `path-safety.ts` / `file-walker.ts` — path-traversal protection
  (`resolveWithinRoot`, rejecting `../` escapes and absolute-path escapes),
  symlink protection (refuses to follow a symlink whose real path resolves
  outside the ingestion root), vendor/generated directory exclusion,
  per-file and aggregate repository size limits, and binary exclusion by
  content sniff (a NUL byte in the first 8KB), not just file extension.
- **Verified with a real local git repository** (not mocked): the test
  suite creates an actual origin repo via the `git` binary, commits twice,
  and asserts `cloneRepositoryAtCommit` (a) checks out the _exact_
  requested commit rather than just `HEAD`, (b) falls back correctly when
  `uploadpack.allowReachableSHA1InWant` is disabled on the server, (c)
  leaves a maliciously named shell script as inert data — it is never
  executed, and (d) redacts an embedded credential from both the thrown
  error's message _and_ its raw `stderr` (git's own error text embeds the
  full URL, e.g. `unable to access 'https://user:pass@host/...'` — the
  first redaction pass missed this and only scrubbed the constructor's own
  interpolation; fixed by scrubbing the literal raw URL out of stderr too).

**Code graph** (`src/graph/`), built on `ts-morph` (AST-based, not regex):

- File, function (including named `const x = () => {}`), class, and method
  nodes.
- `IMPORTS` edges — resolved for local relative imports (file → file) and
  external package specifiers (file → synthetic `external_module` node).
- `EXPOSES_ROUTE` — Express-style `app.get('/path', ...)` and NestJS
  `@Controller()`/`@Get()` (with prefix + sub-path combined).
- `READS_FROM` — `process.env.X` and `process.env["X"]` reads, attributed
  to the containing function via AST-parent-walk, not line-proximity
  guessing.
- `CALLS_EXTERNAL` — `fetch(...)`, `axios.*`, `http(s).get/request`, `got`.
- `QUERIES` + `READS_FROM`/`WRITES_TO` — Prisma-style
  `prisma.<model>.<verb>(...)`, split by read vs. write verb.
- `AUTHENTICATES` / `AUTHORIZES` — NestJS `@UseGuards(...)`, classified by
  a naming heuristic (documented in-code as a heuristic, not a semantic
  guarantee).
- Two entry points: `buildCodeGraphFromSources` (in-memory, used by tests)
  and `buildCodeGraphFromDirectory` (real files — takes the file list
  `walkRepositoryFiles` already filtered, so exclusion/size limits are
  enforced in exactly one place, not duplicated).

**Not yet covered** (documented, not hidden): middleware chains,
non-Prisma ORMs/raw SQL, non-Express/Nest frameworks, cross-file call-graph
resolution (`CALLS` edges between functions), and languages other than
TS/JS/JSX — the extension points exist (one file per rule, one builder
entry point) but only TypeScript/JavaScript has rules implemented, per the
"initially support excellent TypeScript/JavaScript analysis" scope in
Section 8.

**Test results**: 30 tests (28 passed, 2 skipped). The 2 skipped are the
symlink-escape tests — this Windows dev machine's account can't create
filesystem junctions (probed at runtime; the tests skip themselves rather
than being asserted false-positive), so symlink protection is implemented
and code-reviewed but not test-verified in _this_ environment. It will run
for real in CI on Linux. `pnpm build`/`lint`/`typecheck`/`test` are green
across all 6 packages/apps (20/20 Turborepo tasks).

**Known minor issue**: `apps/api`'s Jest run prints "A worker process has
failed to exit gracefully" — a leaked handle somewhere in the health
indicator tests (likely the mocked ioredis client). All tests still pass;
tracked for cleanup, not blocking.

## Research verification (pre-Phase 7)

Before writing scanner normalizers, fetched the current documented JSON
output schemas rather than working from memory, since getting a security
tool's parser subtly wrong is a real correctness bug:

- Semgrep: `docs.semgrep.dev/semgrep-appsec-platform/json-and-sarif` —
  confirmed `check_id`/`path`/`start`/`end`/`extra.{message,severity,
metadata,lines}` shape, and that `metadata.cwe`/`metadata.owasp` can be
  string _or_ array (handled both).
- Gitleaks: confirmed field names (`RuleID`, `StartLine`, `Secret`,
  `Match`, `Fingerprint`, etc.) via the project's own README/docs.
- OSV-Scanner: confirmed `results[].source`/`packages[].package`/
  `vulnerabilities[]` structure and that severity commonly lives in
  `database_specific.severity` rather than requiring CVSS-vector parsing,
  via `google.github.io/osv-scanner/output`.

None of the three tools are installed on this development machine (no
network-based package manager access confirmed, no Docker) — this is
reflected honestly in the adapters and tests below, not papered over.

## Phase 7 completion notes

Built `packages/findings` (canonical model) and `packages/security-engine`
(the three scanner adapters), with a repo-wide fix along the way.

**`packages/findings`**:

- `FindingDraft`/`FindingEvidenceDraft` — the pre-persistence shape every
  scanner normalizer produces, evidence-array-first so the correlation
  engine (Phase 8, not yet built) has something to merge.
- `computeFingerprint()` — anchors on the matched snippet text when a
  scanner provides one (Semgrep's `extra.lines`, gitleaks' own
  fingerprint), falling back to line number only when no snippet exists
  (dependency advisories have no line at all). Tested to prove the
  snippet-anchored case stays stable when an unrelated line-number shift
  happens elsewhere in the file — a pure line-number fingerprint would
  spuriously "resolve and recreate" the same finding on every scan once
  anything above it in the file changes.

**`packages/security-engine`** — one adapter per tool, all implementing a
common `ScannerAdapter` interface (`checkAvailability()` / `scan()`):

- Every adapter shells out via `execFile` with argument arrays (no shell).
- **Never fabricates a result.** `checkAvailability()` and `scan()` both
  return a genuine `unavailable`/`available:false` outcome — never a fake
  version string or an empty-but-"completed" scan — when the binary isn't
  on PATH. Verified with real (not mocked) `ENOENT` behavior against
  nonexistent binary names, plus a `runScannerProcess` unit test proving
  the ENOENT/timeout/non-zero-exit paths are each distinguished correctly
  using the real Node binary as the test subprocess.
- Semgrep adapter: `semgrep scan --config auto --json`.
- Gitleaks adapter: `gitleaks detect --no-git --report-format json
--exit-code 0` (writing to a temp report file, cleaned up after read) —
  forcing exit 0 even when secrets are found means a non-zero exit
  reliably signals a genuine tool error, not "leaks were found".
- OSV-Scanner adapter: `osv-scanner --format json --recursive`.
- **Secret redaction enforced in code, not convention**: the Gitleaks
  normalizer never lets `Secret`/`Match` reach the returned `FindingDraft`
  — they're passed through `maskSecretValue` (new in
  `packages/shared/src/redact.ts`) first. Tested by asserting the raw
  secret string is absent from `JSON.stringify(draft)` entirely, not just
  "probably redacted."
- OSV normalizer treats a resolved advisory match as `confidence:
"confirmed"` (a database lookup, not a heuristic), while Semgrep/Gitleaks
  findings get `"high"/"medium"` confidence — a deliberate distinction
  documented in-code.

**Repo-wide tsconfig change**: disabled `exactOptionalPropertyTypes`. It
kept rejecting the normal `{ foo: condition ? value : undefined }` pattern
that naturally shows up when mapping heterogeneous scanner output onto
optional fields — fighting a common, safe idiom five times over was a
worse trade than losing that one strictness flag. `strict` and
`noUncheckedIndexedAccess` are unaffected.

**Test results**: 24 new tests in `security-engine` (all passing), 7 in
`findings`. Workspace total is now 94 tests across 8 packages/apps, all
passing; `pnpm build`/`lint`/`typecheck`/`test` green (21/21 Turborepo
tasks).

## Phase 8 completion notes

Built into `packages/findings`:

- `correlateFindings()` — groups `FindingDraft`s from potentially
  different detectors into one `CorrelatedFinding` (with a `detectedBy:
FindingSource[]` list) instead of one Finding per detector, per Section 16. Matching is deliberately simple and documented as such (union-find
  over same-file/near-line-range or same-category+symbol pairs) rather
  than claiming semantic similarity it doesn't do. Confidence escalates
  one level when 2+ _distinct_ sources agree (capped at "confirmed");
  severity takes the max across the group; the representative
  title/description is chosen by a documented priority
  (dynamic_validation > static_analysis > ai_review > secret_detection >
  dependency_analysis > code_intelligence).
- **Caught and fixed a real bug via its own test**: the merged fingerprint
  was only recomputed for multi-source groups — a singleton finding kept
  its original per-source fingerprint. That meant the same issue would get
  a _different_ fingerprint the moment a second detector started seeing it
  across scans, defeating the entire "stable fingerprint" premise. Fixed
  by always computing the source-independent correlation fingerprint,
  regardless of group size.
- `computeSecurityScore()` — the **Sentinel Security Score** (explicitly
  named as Sentinel's own metric, not a claimed industry standard, per
  Section 17). Formula: start at 100, subtract
  `severityWeight × confidenceMultiplier × ageMultiplier × validationMultiplier`
  per currently-open finding, floor at 0. Resolved/false-positive/
  accepted-risk findings never count; older open findings cost more (up to
  1.5x at 30+ days); a dynamically-confirmed finding costs 1.2x more than
  an equivalent unverified one. Fully documented in the function's own
  doc comment — the formula lives in one place, not scattered across a
  separate spec doc that could drift from the code.

**Test results**: 28 tests in `packages/findings` (11 correlation, 10
scoring, 7 fingerprint). Workspace total: 115 tests across 8 packages/apps,
28/28 Turborepo tasks green.

## Phase 9 completion notes

Built `packages/ai-engine`. Verified current provider SDK usage via each
project's own docs (Anthropic `messages.create`, OpenAI's current
`responses.create` Responses API for the hosted provider vs.
`chat.completions.create` for local OpenAI-compatible servers, which don't
implement the newer Responses surface) rather than assuming — this
environment has no AI credentials configured, so nothing here has been
exercised against a live model; that's stated plainly rather than implied
otherwise.

- **Provider abstraction**: `AIProvider` interface + `AnthropicProvider`,
  `OpenAIProvider`, `LocalOpenAICompatibleProvider`, and
  `createProviderFromConfig()` which returns `null` — never a fake or
  half-configured provider — when `AI_PROVIDER` is `"none"` or its
  matching key/URL is absent.
- **Prompt-injection defense (Section 14, "essential")**:
  `wrapUntrustedContent()` puts explicit BEGIN/END markers and an explicit
  "this is data, not instructions" warning around every piece of
  repository-derived content; `buildSystemPreamble()` keeps Sentinel's own
  task instructions clearly separated from and prioritized over anything
  wrapped as untrusted. `detectPromptInjectionAttempt()` is a secondary,
  audit-only heuristic layer — flagged and returned to the caller via
  `injectionWarnings`, never used to block or alter the call, because the
  real defense is architectural: the model's output is only ever
  schema-validated structured data, never a command, and nothing it says
  triggers a tool call directly (Scope Guard, Phase 10, sits outside the
  model entirely for anything touching a real system).
- **Secret redaction before every AI call**: `redactSecretsInText()`
  pattern-matches and masks AWS keys, private-key blocks, GitHub tokens,
  JWTs, and generic `key: "value"` secrets in any untrusted content block
  before it's wrapped and sent. Caught and fixed a real bug in its own
  test: the generic key=value pattern could re-match the substring
  `token` inside an already-redacted `github_token` field (both sides of
  the underscore are word characters, so naively there's no boundary) —
  fixed with an explicit `\b` word-boundary around the keyword.
- **Schema-validated structured output**: `completeStructured()` never
  returns the model's raw text — only the result of parsing it as JSON and
  validating it against a caller-supplied zod schema. An invalid response
  triggers a corrective follow-up turn (bounded retries); exhausting all
  attempts throws `AISchemaValidationError` rather than returning
  unvalidated data. Verified against a `FakeProvider` test double proving
  the retry-on-bad-JSON path, retry-on-schema-mismatch path, markdown
  code-fence stripping, and the exhausted-retries failure path all work —
  plus that untrusted content really does arrive at the provider wrapped
  in the untrusted markers and with any embedded secret already redacted.
- **Cost tracking**: `estimateCostUsd()` (documented-approximate per-model
  pricing table, safe fallback for unknown models) and `BudgetGuard`
  enforcing `AI_PER_SCAN_BUDGET_USD`/`AI_MONTHLY_BUDGET_USD` — a call whose
  estimated cost would exceed either budget is rejected before it's made,
  never after.
- One demonstration end-to-end schema/prompt pair (`findingAnalysisSchema`
  - `buildFindingAnalysisPrompt`) showing the false-positive-reduction /
    remediation-suggestion use case from Section 13 wired together with all
    of the above.

**Test results**: 44 new tests in `ai-engine` (14 injection-detector, 7
secret-redaction, 8 structured-client, 5 budget-guard, 5 pricing, 5
factory), all passing. Workspace total: 159 tests across 9 packages/apps,
32/32 Turborepo tasks green.

## Phase 10 + 11 completion notes

Built `packages/hexstrike-adapter`, covering both Scope Guard (Section
19-20) and the HexStrike integration (Section 18) together since the spec
treats them as one continuous concern and Section 20 requires every
HexStrike call to pass through Scope Guard immediately beforehand.

**Real interface research, not guessed**: the `hexstrike-ai` MCP server is
actually connected in this environment. Rather than guess HexStrike's REST
API shape, called its passive, read-only tools (`server_health`,
`get_telemetry`, `nmap_scan` against a placeholder target, `get_process_status`)
against the (unreachable) local HexStrike server and read the real error
messages, which reveal the genuine endpoint URLs verbatim:
`GET /health`, `GET /api/telemetry`, `POST /api/tools/<toolName>`,
`GET /api/processes/status/<pid>`, base `http://127.0.0.1:8888`. The
`terminate` endpoint (used by `cancel()`) is inferred by convention from
the verified `/api/processes/.../<pid>` pattern but wasn't independently
confirmed (an attempt to verify it was blocked by this session's own
auto-mode classifier) — documented as inferred, not verified, rather than
presented as equally certain.

**Scope Guard** (`src/scope-guard/`) — the deterministic boundary that
sits outside the AI and cannot be influenced by it:

- `ip-blocklist.ts`: dependency-free IPv4 CIDR matching (RFC1918, loopback,
  link-local — which covers the 169.254.169.254 cloud metadata endpoint —
  CGNAT, and the reserved/test ranges) plus narrower but still-tested IPv6
  coverage (loopback, link-local, unique-local, IPv4-mapped). Fails
  _closed_: a malformed IP is treated as blocked, not allowed.
- `resolve-and-check.ts`: always resolves the hostname fresh and checks
  the **resolved address**, never the hostname string alone — the specific
  defense against DNS rebinding (a domain that resolves to a public IP at
  check time and a private one moments later). Takes an injectable
  resolver so this is fully unit-testable without real DNS/network access.
  Documented in-code: whoever wires up the actual outbound HTTP request
  this check gates MUST connect to the exact address just checked (DNS
  pinning), not re-resolve a second time, or the check-then-connect gap
  becomes its own rebinding window.
- `scope-guard.ts` (`evaluateScopeGuard`): the full decision chain — valid
  URL → http(s) only → not a bare localhost/loopback hostname unless
  `localLabMode` → a matching, non-revoked, unexpired, _verified_
  authorization exists for the exact scheme+host+port → requested tier
  doesn't exceed the authorization's max tier → path is within an allowed
  prefix → resolved address isn't blocked. Every branch fails closed.
  36 tests cover each rejection reason individually, a DNS-rebinding
  scenario, a literal-cloud-metadata-IP scenario, and the case where the
  path/tier/host all check out.

**HexStrike adapter** (`src/client/`, `src/provider.ts`):

- `HexStrikeHttpClient` — talks to the four verified endpoints above,
  never throws (a connection failure, timeout, or non-JSON response all
  come back as `{ success: false, error }`, matching HexStrike's own
  failure shape). Tested against a real local HTTP server spun up in the
  test file, not a mocked `fetch`.
- `HexStrikeDynamicValidationProvider` implements the
  `DynamicValidationProvider` interface from Section 18. **Scope Guard
  runs unconditionally at the top of `validate()`, before the
  capability/tier check and before any HexStrike call** — this is the
  actual code-level enforcement of "HexStrike cannot bypass Scope Guard,"
  verified by a test asserting `runTool` is never called when Scope Guard
  rejects.
- Only two capabilities are offered — `http_probe` (Tier 0, via httpx) and
  `vulnerability_scan` (Tier 1, via Nuclei) — and `ValidationRequest`'s
  `validationType` is a closed union of just those two ids, so no
  type-checked call site can even construct a request for a Tier 2/3
  capability that doesn't exist. Tier 2 (admin-approval-gated) and Tier 3
  (destructive) are not implemented at all, per Section 22.
- `ValidationRateLimiter` — in-memory concurrency/RPS/total-request caps
  per Section 21's conservative-defaults requirement; not yet wired into a
  real queue (that's the worker's job once it exists).
- Caught a real gap via its own tests: `validate()` initially had no way
  to inject a DNS resolver into its Scope Guard call, so tests against
  placeholder hostnames like `target.example.com` fell through to real DNS
  resolution and failed closed (correctly, but not what the tests meant to
  exercise). Fixed by threading an optional `resolver` through
  `ValidationRequest` — useful in production too, not just for tests.

**Test results**: 58 tests in `hexstrike-adapter` (11 IP blocklist, 8 DNS
resolution, 16 Scope Guard end-to-end, 8 HTTP client, 9 provider, 6 rate
limiter). Also fixed pre-existing flakiness in
`code-intelligence`'s git-ingestor tests surfaced by running the full
workspace concurrently: a real git subprocess occasionally holds a file
handle past process exit long enough for Windows to throw `EPERM` on an
immediate `rmSync`, and the default 5s vitest timeout was tight for real
git operations under concurrent load. Fixed with a scoped
`vitest.config.ts` (30s timeout) and `maxRetries`/`retryDelay` on the
cleanup `rmSync` calls — not by weakening what the tests assert.

Workspace total: 217 tests across 10 packages/apps, 36/36 Turborepo tasks
green.

## Phase 12 completion notes

Built `packages/github`. Verified `@octokit/app`'s real constructor and
`getInstallationOctokit` shape against its own documentation before
writing against it (matched what was drafted).

- `verifyWebhookSignature()` — HMAC-SHA256 verification of GitHub's
  `X-Hub-Signature-256` header, constant-time comparison via
  `timingSafeEqual` with the length-mismatch case handled explicitly
  first (`timingSafeEqual` throws rather than returning false on unequal
  lengths — a common bug source). 7 tests including a tampered-payload
  case and malformed-header cases that must not throw.
- `isDuplicateDelivery()` / `InMemoryDeliveryStore` — idempotent webhook
  processing keyed on GitHub's per-delivery-attempt id (Section 6:
  "prevent replay/duplicate job problems"); a real deployment backs this
  with Redis (already in the stack) with a TTL.
- `classifyChangedFiles()` — fast path/diff-based PR triage (auth logic,
  authorization logic, database access, sensitive config, dependency
  manifests, CI/CD config, external requests) feeding Section 25's
  "Sensitive Files Changed" / focused-PR-review concept. Deliberately
  lighter-weight than the AST-based code-intelligence graph — this exists
  to decide _whether_ a PR needs deep attention, fast, not to replace deep
  analysis.
- `GITHUB_APP_PERMISSIONS` / `GITHUB_APP_WEBHOOK_EVENTS` — the exact,
  justified minimum-necessary permission set (Section 6), with a
  "permissions contract" test that fails loudly if a future change adds a
  scope without the justification comment being updated in the same diff.
- `GitHubAppClient` wraps `@octokit/app` + `@octokit/rest` for
  installation sync, PR/file retrieval, check runs, and the
  branch-commit-PR sequence the remediation workflow needs later. Real,
  correct SDK usage — but **not exercised against a live GitHub App**, no
  GitHub App credentials are configured here. Stated plainly.
- Fixed a genuine TypeScript declaration-emission bug along the way
  (TS2742: "inferred type cannot be named") for the four methods that
  return the _whole_ Octokit response rather than just `.data` — those
  needed explicit return-type annotations. Initially over-corrected by
  annotating _every_ method via a separately-imported `@octokit/types`
  dependency, which triggered a real version-mismatch bug (pnpm resolved
  three different `@octokit/types` versions simultaneously, and their
  `id: number` vs `id: number | bigint` shapes conflicted). Fixed properly
  by deriving return types from the `OctokitRest` instance type itself
  (one source of truth, no separate dependency) and only annotating the
  four methods that actually needed it.

**Test results**: 28 new tests in `github` (7 signature verification, 4
delivery dedup, 13 changed-files classification, 4 permissions contract).
Workspace total: 245 tests across 11 packages/apps, 40/40 Turborepo tasks
green.

## Phase 13 completion notes

Built `packages/policy-engine` and, more significantly, `apps/worker` —
the piece that actually wires every previously-built package into one
real job pipeline instead of a set of disconnected libraries.

**`packages/policy-engine`**: `evaluatePolicy()` against a discriminated
`PolicyRule` union (not a stringly-typed config bag), plus
`DEFAULT_POLICY_RULES` implementing Section 28's five example policies
exactly (fail on critical, fail on confirmed high, block new secrets,
block critical dependency vulnerabilities, require review for auth
changes). Every enabled rule is evaluated independently — a caller sees
every violation at once, not just the first.

**`apps/worker`**: `runScanPipeline()` orchestrates clone → walk → build
code graph → run every configured scanner → correlate findings → compute
the security score → evaluate policy → optionally AI-analyze the
highest-severity findings — with every dependency injected, so this
composition is tested without needing a real git binary, real scanners, a
real AI provider, or Redis (each of those is already tested in its own
package; this proves they wire together correctly). Two honesty-driven
design decisions:

- A missing/unavailable scanner, or a failed AI call, never aborts the
  scan — deterministic results already computed remain valid, matching
  Section 43's "AI provider unavailable — deterministic analysis completed
  successfully" example verbatim as the actual skip-reason string.
- Every finding in a fresh scan is scored/policy-evaluated as freshly
  "open" with no history, since the database-backed findings-persistence
  layer (tracking real first-seen dates and status across scans) isn't
  wired into the worker yet — stated as a documented simplification in
  the code, not silently assumed.
- The real BullMQ `Queue`/`Worker` wiring (`src/queue/`) is genuine,
  correct usage, but **has not been run against a live Redis** — this
  machine has neither Docker nor a local Redis install, consistent with
  every other "needs real infra" note in this project. `main.ts` parses
  `REDIS_URL` into explicit host/port/credentials rather than passing a
  raw connection string, to avoid depending on exactly which string forms
  a given BullMQ/ioredis version accepts.

**Test results**: 11 new tests in `policy-engine`, 8 in `worker` (covering
the happy path, an unavailable scanner, a failed scanner, a policy
violation, AI-skip-reasons for no-provider/no-model, AI success, and —
critically — AI failure not aborting the scan). Workspace total: 264
tests across 13 packages/apps, 48/48 Turborepo tasks green.

## Phase 15 completion notes

Built `examples/vulnerable-demo-app` — a small standalone Express fixture
(not part of the pnpm workspace glob, so it's never built/linted as part
of this monorepo, only ever ingested/analyzed as a target) with seven
intentional, documented, CWE-tagged vulnerabilities: a fabricated
hard-coded secret, broken object-level authorization, open redirect, path
traversal, `eval()` on user input, a SQL-injection-shaped query builder,
and a pinned known-vulnerable dependency (`lodash@4.17.15`).

**Verified for real, not just asserted**: added an integration test in
`packages/code-intelligence` that runs the actual `walkRepositoryFiles` +
`buildCodeGraphFromDirectory` against this real fixture directory on disk
(not a synthetic in-memory snippet) and confirms all five routes and the
`DEMO_PORT` env-var usage are correctly detected — proving Section 33's
"Sentinel should be able to analyze this fixture" end to end through the
actual ingestion + AST pipeline, on the first run.

Semgrep/Gitleaks/OSV-Scanner results against this fixture couldn't be
demonstrated live in this environment (none of the three tools are
installed here, per Phase 7's notes) — that's a real, disclosed gap, not
one this fixture papers over.

## Phase 17 completion notes

Wrote `apps/api/Dockerfile` and `apps/worker/Dockerfile` using
Turborepo's documented `turbo prune --docker` pattern (multi-stage:
prune → install pruned deps → `turbo run build --filter=<app>...` →
copy into a slim non-root runtime image), plus `.dockerignore` and
`api`/`worker` services added to `docker-compose.yml` alongside the
existing Postgres/Redis/MinIO. **Not built or run** — no Docker engine is
installed on this machine (confirmed in Phase 2's research notes) — run
`docker build` yourself to validate before relying on these in
production. `apps/web` has no Dockerfile yet (no frontend exists yet).

Added `.github/workflows/ci.yml`: install → format check → lint →
typecheck → test → build, all via pnpm/Turborepo on `ubuntu-latest`.
Before writing it, ran `pnpm format:check` locally and found 60 files
that didn't match Prettier's exact rules (whitespace/wrapping
differences from hand-written code, not logic issues) — fixed with
`pnpm format` and re-verified the full `build`/`lint`/`typecheck`/`test`
suite still passes (48/48 tasks), so the CI workflow isn't referencing a
check that would fail on its first real run.

## Phase 18 completion notes

Wrote the full `docs/` set: `architecture.md`, `threat-model.md`,
`security-model.md`, `scope-guard.md`, `hexstrike-integration.md`,
`github-app.md`, `ai-security.md`, `local-development.md`,
`deployment.md`, `demo.md`, `licensing.md`. Every one was written against
what's actually built and tested in this repository — not the aspirational
final product — and each states plainly, in its own text, which
integrations haven't been exercised live (AI, GitHub App, HexStrike,
Docker) rather than letting that ambiguity sit implicit. README.md updated
with a documentation index and its stale "once written" caveats removed
now that those files exist.

## Phase 16 completion notes

Section 35 calls for regression coverage across SSRF, cross-tenant IDOR,
path traversal, webhook forgery, prompt injection, and secret leakage.
Five of six already existed scattered across packages by this point in
the build; the sixth (cross-tenant IDOR) had **no coverage at all**,
because no tenant-scoped endpoint existed yet to attack. Rather than just
document that gap, closed it:

- **New `packages/auth`**: `canAccessOrganization()` /
  `assertOrganizationAccess()` — the single, framework-agnostic choke
  point every tenant-scoped resource lookup should pass through, tested
  directly (8 tests, including the IDOR case: a user who exists, but has
  no membership in the resource's organization, is denied).
- **New `apps/api` endpoint**, `GET /repositories/:id`, wires this into a
  real (if minimal — no session auth exists yet, so it reads a
  `x-demo-user-id` header, explicitly documented as a placeholder) code
  path: `RepositoriesService.getRepositoryForUser()` loads the resource,
  then checks membership, and returns `null` — mapped to a 404, not a
  403 — for a cross-tenant request, so an unauthorized caller can't even
  learn the resource exists. 4 regression tests, including the core case:
  a real row exists in the (mocked) database, but a user without
  membership in its organization never receives it.
- SSRF: `packages/hexstrike-adapter`'s Scope Guard suite (35 tests).
- Path traversal: `packages/code-intelligence`'s `path-safety`/
  `file-walker` suites.
- Webhook forgery: `packages/github`'s `verify-signature` suite.
- Prompt injection: `packages/ai-engine`'s `injection-detector` suite.
- Secret leakage: `packages/shared`'s `redact` suite,
  `packages/security-engine`'s Gitleaks normalizer tests, and
  `packages/ai-engine`'s `redact-secrets-in-text` suite.

**Remaining gap, disclosed not hidden**: only the one repositories
endpoint exercises tenant-access checking today; scans/findings/target-
authorization endpoints don't exist yet, so they aren't IDOR-tested.

Workspace total: 277 tests across 15 packages/apps, 52/52 Turborepo
tasks green.

## Phase 13b completion notes

Built the remediation workflow (Section 26/27) in `apps/worker/src/remediation/`,
plus a new `patchSuggestionSchema`/`buildPatchSuggestionPrompt` in
`packages/ai-engine`.

- **`generatePatchSuggestion()`** — sends the finding + the affected
  file's full original content (wrapped as untrusted, per the AI
  engine's existing defenses) to the AI engine and gets back a structured
  suggestion: an explanation and the complete proposed file content (not
  a unified diff — GitHub's Contents API needs full content regardless,
  and hand-rolling diff application is a real source of subtle
  corruption bugs a simpler, equally correct design avoids). Never
  throws; a missing provider, missing model, or failed call all resolve
  to a `"skipped"` result with a reason, consistent with every other
  AI-consuming code path in this project.
- **`applyApprovedPatchAsPullRequest()`** — the only path in this
  codebase that writes a remediation to GitHub. Refuses to run at all —
  throwing `PatchNotApprovedError` before touching the GitHub client —
  unless `approvedByUserId` is set. Verified by a test asserting
  `createBranch`/`commitFileChange`/`createPullRequest` are _never
  called_ when approval is missing, and that they run in the correct
  order (branch → commit → PR) when it is. The PR body includes the
  explanation, any risks/limitations the AI flagged, and the approver's
  identity for audit.
- Fixed the same TS2742 "inferred type cannot be named" issue encountered
  in Phase 12 (a function returning the whole Octokit response needs an
  explicit return-type annotation) — this time derived directly from
  `ApplyPatchDependencies["githubClient"]["createPullRequest"]`'s own
  return type rather than reaching for a separate `@octokit/types`
  dependency, avoiding the version-mismatch trap from last time.

**What this does not do**: decide whether a patch _should_ be approved —
that's a human decision via a product UI that doesn't exist yet — or
persist `Patch`/`PullRequest` rows to the database (no findings/patch
persistence layer is wired into the worker yet, consistent with the
Phase 13 pipeline notes).

**Test results**: 9 new tests (5 `generate-patch`, 4
`apply-approved-patch`), all passing. Workspace total: 286 tests across
15 packages/apps, 52/52 Turborepo tasks green.

## Pre-Phase-14 backend additions

Before building the frontend, added the two real endpoints it needs so
there would be something genuine to call rather than mocking the API
client:

- **`GET /repositories`** — lists every repository owned by any
  organization the caller belongs to (same tenant-scoping as the
  existing `GET /repositories/:id`).
- **`GET /dashboard/summary`** — computes the real Sentinel Security
  Score and open-finding counts from actual `Finding` rows scoped to the
  caller's organizations (mapping Prisma's uppercase enum values to
  `@sayan-sentinel/shared`'s lowercase vocabulary), returning a perfect
  100/zero-counts result for a user with no findings rather than an
  error — a genuinely empty result, not a fabricated one.
- Enabled CORS on `apps/api` (scoped to `APP_URL`) so the frontend can
  call it from a different origin in local dev.

**Manually smoke-tested against a running (but DB/Redis-less) server**
before writing it up: `/health/live` → 200, `/repositories` with no auth
header → 401, `/repositories` with an identity but no reachable Postgres
→ a genuine 500 with Prisma's real connection error, never fabricated
data. Locked both the 401 and 500 behavior in as e2e tests. While
re-running the full verification sweep afterward, `packages/database`'s
build failed with `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`
— traced to a `node.exe` process left running from the manual smoke test
(the `pkill` used to stop it didn't work reliably against a
Windows-spawned Node process from Git Bash); killed it via PowerShell's
`Stop-Process` and the build succeeded immediately after, confirming it
was a transient environment issue, not a code regression.

9 new tests (2 repository-listing, 4 dashboard, 3 e2e). Workspace total:
295 tests across 15 packages/apps, 52/52 Turborepo tasks green.

## Phase 14 completion notes

Built `apps/web` — Next.js 16 (App Router), React 19, Tailwind CSS 4. Two
of the ten planned nav sections are genuinely real, connected to the two
`apps/api` endpoints built for exactly this purpose; the other eight
render an explicit `NotImplementedPage` component rather than being
omitted from navigation or filled with placeholder data — per Section 44
("no fake buttons"), a link to a clearly-labeled "not implemented yet"
page is not deceptive; a page that pretends to work or shows fabricated
data would be.

- **Overview** (`/`) and **Repositories** (`/repositories`) fetch live
  from `GET /dashboard/summary` and `GET /repositories` respectively, as
  React Server Components (no client-side loading spinners needed for the
  initial render).
- **Verified in an actual browser, not just built** — this matters more
  than usual here because the whole point was proving the "no fake data"
  rule holds under real conditions, not just in code review:
  1. API not running at all → "Could not reach the Sentinel API at
     http://localhost:4000. Is it running?"
  2. API running, Postgres/Redis unreachable → the API's genuine 500
     ("Internal server error" — NestJS correctly doesn't leak the Prisma
     stack trace to the client, only to server logs), surfaced honestly
     in the UI rather than papered over.
  3. A placeholder page (Code Graph) renders the "Not implemented yet"
     state with correct active-route sidebar highlighting.
     All three were screenshotted during development, not assumed.
- Dark graphite theme (`src/app/globals.css`, Tailwind v4 `@theme`
  tokens) with a subtle grid background and cyan → blue → violet accents,
  matching Section 4's direction — deliberately not a neon "hacker
  terminal" look.
- `pnpm build` genuinely runs `next build`, which type-checks and
  statically analyzes every route — it correctly marked `/` and
  `/repositories` as dynamic (server-rendered per-request, since they
  fetch live data) and the other eight as static.

**Known gaps, disclosed**: no component/e2e test suite for the frontend
yet (verified manually in-browser instead, both stated above); Scans,
Findings, Code Graph, Pull Requests, Policies, Integrations, Activity, and
Settings remain unbuilt; no Dockerfile for `apps/web` yet.

## Phase 19 completion notes — final audit

Performed a genuine audit pass rather than a rubber-stamp: checked for
loose ends, tested the frontend at a real mobile viewport instead of
assuming Tailwind's responsive classes were sufficient, and re-ran the
full verification suite one more time before calling anything done.

**Findings and what happened to each:**

- **No stray TODO/FIXME comments** anywhere in source (`grep`-verified) —
  nothing presented as complete while secretly unfinished.
- **No committed secrets**: scanned every tracked file for real-looking
  AWS/GitHub/OpenAI key shapes and private-key blocks; the only matches
  are inside test fixtures using deliberately fake/example values (AWS's
  own documented example key, obviously-placeholder tokens). No `.env`,
  `.pem`, or `secrets/` path is tracked.
- **Mobile responsiveness was actually broken** — screenshotted `apps/web`
  at a real 375px mobile viewport (not assumed from the Tailwind classes
  alone) and found the fixed `w-64` sidebar consumed most of the screen,
  pushing page content almost entirely off-canvas. Fixed with a proper
  off-canvas drawer (`AppShell` + a mobile topbar with a hamburger
  toggle), verified working in both directions (open via the menu button,
  close via the backdrop) by driving the actual DOM state, and confirmed
  desktop layout was unaffected by the change.
- **Added missing accessibility basics** while in there: `focus-visible`
  ring states on nav links (keyboard users had no visible focus
  indicator before), `aria-current="page"` on the active nav link,
  `aria-label`s on the menu open/close controls, and a
  `prefers-reduced-motion` media query disabling transitions for users
  who need it — none of these existed before this audit pass.
- **Re-ran the complete verification suite** after every fix in this
  phase, not just at the end: `pnpm format` / `format:check`,
  `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` — all green
  (55/55 Turborepo tasks) on the final run.

**What this audit did not do**: a full WCAG conformance pass, a Lighthouse
performance audit, or a dependency vulnerability scan of Sentinel's own
`node_modules` (ironic, since that's exactly what OSV-Scanner would do —
and it isn't installed in this environment, per Phase 7's notes). These
are reasonable next steps for whoever picks this project up next, not
silently-skipped work presented as covered.

## Working agreement for remaining phases

- Each phase lands as real, runnable code plus whatever test coverage that
  phase's Definition-of-Done items call for — not a stub presented as
  complete.
- A phase that depends on a credential the user hasn't supplied (GitHub App
  keys, an AI provider key) is built in full and left in its documented
  "not configured" state, never faked.
- This file's status table is updated at the end of each phase.
- The final report (engineering summary, what's real vs. pending
  credentials, exact run commands) is produced once Phase 19's audit
  actually passes lint/typecheck/test/build — not before.
