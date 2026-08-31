# Implementation Plan

This document tracks the real build status of Sayan Sentinel against the
phased plan. It is updated as phases complete — nothing here is marked done
until it genuinely works (builds, runs, and is tested).

Status legend: `not started` · `in progress` · `done`

| Phase | Scope | Status |
|---|---|---|
| 1 | Repository inspection | done |
| 2 | Dependency/API research (GitHub App, Semgrep, Gitleaks, OSV-Scanner, HexStrike MCP surface) | done |
| 3 | This plan | done |
| 4 | Monorepo scaffold, root tooling, contracts | done |
| 5 | Foundational backend (NestJS API skeleton, health/readiness, config, logging) | done |
| 6 | Repository ingestion + code intelligence (AST graph) | done |
| 7 | Deterministic security engine (Semgrep/Gitleaks/OSV-Scanner adapters) | done |
| 8 | Findings model + correlation engine | done |
| 9 | AI engine (provider abstraction, schema-validated reasoning) | not started |
| 10 | Scope Guard | not started |
| 11 | HexStrike AI adapter (real interface) | not started |
| 12 | GitHub App integration | not started |
| 13 | Remediation / patch / PR workflow | not started |
| 14 | Frontend (Next.js, dashboard, code graph, findings) | not started |
| 15 | Vulnerable demo fixture | not started |
| 16 | Tests + security regression suite | not started |
| 17 | Docker / CI | in progress (local infra compose done; app containers + CI pending) |
| 18 | Documentation | in progress |
| 19 | Full audit | not started |

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
  must be implemented against this *actual* tool surface, not a guessed REST
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
  and asserts `cloneRepositoryAtCommit` (a) checks out the *exact*
  requested commit rather than just `HEAD`, (b) falls back correctly when
  `uploadpack.allowReachableSHA1InWant` is disabled on the server, (c)
  leaves a maliciously named shell script as inert data — it is never
  executed, and (d) redacts an embedded credential from both the thrown
  error's message *and* its raw `stderr` (git's own error text embeds the
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
and code-reviewed but not test-verified in *this* environment. It will run
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
  string *or* array (handled both).
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
  FindingSource[]` list) instead of one Finding per detector, per Section
  16. Matching is deliberately simple and documented as such (union-find
  over same-file/near-line-range or same-category+symbol pairs) rather
  than claiming semantic similarity it doesn't do. Confidence escalates
  one level when 2+ *distinct* sources agree (capped at "confirmed");
  severity takes the max across the group; the representative
  title/description is chosen by a documented priority
  (dynamic_validation > static_analysis > ai_review > secret_detection >
  dependency_analysis > code_intelligence).
- **Caught and fixed a real bug via its own test**: the merged fingerprint
  was only recomputed for multi-source groups — a singleton finding kept
  its original per-source fingerprint. That meant the same issue would get
  a *different* fingerprint the moment a second detector started seeing it
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
