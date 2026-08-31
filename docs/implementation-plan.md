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
| 14    | Frontend (Next.js, dashboard, code graph, findings)                                         | not started                                                              |
| 15    | Vulnerable demo fixture                                                                     | done                                                                     |
| 16    | Tests + security regression suite                                                           | done                                                                     |
| 17    | Docker / CI                                                                                 | done (Dockerfiles/CI unbuilt-locally — no Docker engine here; see notes) |
| 18    | Documentation                                                                               | done                                                                     |
| 19    | Full audit                                                                                  | not started                                                              |

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
