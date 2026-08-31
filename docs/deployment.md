# Deployment

This document describes the intended production shape. It has **not**
been deployed anywhere from this environment (no Docker engine, no cloud
credentials here) — treat this as a documented plan to validate, not a
verified runbook.

## Container images

`apps/api/Dockerfile` and `apps/worker/Dockerfile` use Turborepo's
`turbo prune --docker` pattern: prune the monorepo down to the one app's
actual dependency subset, install with a frozen lockfile, build with
`turbo run build --filter=<app>...`, then copy the result into a slim,
non-root runtime image. Neither has been built in this environment —
run `docker build -f apps/api/Dockerfile .` yourself before relying on
either.

`apps/web` has no Dockerfile yet (no frontend exists yet).

## Required infrastructure

- **PostgreSQL** — run `prisma migrate deploy` (not `migrate dev`) against
  it before starting `apps/api`/`apps/worker`.
- **Redis** — backs BullMQ (`apps/worker`).
- **S3-compatible object storage** — for scan artifacts (MinIO locally;
  any S3-compatible provider in production).
- A **GitHub App** registration — see [github-app.md](github-app.md).
- Optionally: an AI provider API key, and a reachable HexStrike server.

## Environment variables

See `.env.example` for the complete list with inline documentation. Every
optional integration (AI, GitHub App, HexStrike) degrades to a clean "not
configured" state rather than crashing when its variables are absent —
verify this is still true after any change to `packages/config`'s
`loadConfig()` before deploying.

## Secrets

Never commit `.env`, GitHub App private keys, or API keys. In production,
source them from your platform's secret manager and inject them as
environment variables / mounted files (the GitHub App private key is read
from a file path, `GITHUB_APP_PRIVATE_KEY_PATH`, specifically so it can be
a mounted secret rather than an inline env var).

## Database migrations

Run `pnpm --filter @sayan-sentinel/database exec prisma migrate deploy`
as a release step, before the new application version starts serving
traffic — not automatically on every container boot, to avoid concurrent
migration races across multiple replicas.

## Scaling

`apps/api` is stateless and horizontally scalable behind a load balancer.
`apps/worker` consumes from a single BullMQ queue (`sentinel:scan`) with
`concurrency: 1` per process today — running multiple worker replicas
increases throughput linearly since BullMQ handles fair job distribution
across consumers; the per-process concurrency value is a starting point to
revisit once real workloads are measured, not a hard architectural limit.

## What to verify before calling this "production ready"

- [ ] `docker build` succeeds for both Dockerfiles
- [ ] `docker compose up` brings up the full stack and `/health/ready`
      reports genuinely healthy
- [ ] `prisma migrate deploy` runs cleanly against a real Postgres
- [ ] A real GitHub App installation round-trips a webhook through
      `verifyWebhookSignature`
- [ ] A real AI provider key produces a valid `completeStructured` result
- [ ] A reachable HexStrike server passes `healthCheck()`

None of these have been checked off in this environment — this is the
honest list of what remains before a real deployment, not a claim that
they already pass.
