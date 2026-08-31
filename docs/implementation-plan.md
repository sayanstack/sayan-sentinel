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
| 6 | Repository ingestion + code intelligence (AST graph) | not started |
| 7 | Deterministic security engine (Semgrep/Gitleaks/OSV-Scanner adapters) | not started |
| 8 | Findings model + correlation engine | not started |
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
