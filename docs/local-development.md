# Local Development

## Prerequisites

- Node.js ≥ 20.11 (developed against 24.19)
- pnpm ≥ 9 (developed against 10.12)
- git
- Docker (optional — for Postgres/Redis/MinIO via `docker-compose.yml`;
  without it, run those services yourself and point `DATABASE_URL`/
  `REDIS_URL` at them)

## Setup

```bash
git clone <repo-url> sayan-sentinel
cd sayan-sentinel
cp .env.example .env
pnpm install
docker compose up -d      # postgres, redis, minio
```

## Everyday commands

```bash
pnpm build       # turbo run build across every package/app
pnpm lint        # eslint (flat config, repo-wide)
pnpm typecheck   # tsc --noEmit, per package
pnpm test        # vitest (packages) / jest (apps/api)
pnpm format      # prettier --write
pnpm format:check
```

Run any of these scoped to one package: `pnpm --filter @sayan-sentinel/<name> <script>`.

## Database

```bash
pnpm db:migrate   # prisma migrate dev (packages/database)
pnpm db:seed      # local-dev identity only — never fake repos/scans/findings
```

## Running the API/worker directly (without Docker)

```bash
pnpm --filter @sayan-sentinel/api build && pnpm --filter @sayan-sentinel/api start
pnpm --filter @sayan-sentinel/worker build && pnpm --filter @sayan-sentinel/worker start
```

Both require `DATABASE_URL`/`REDIS_URL` to point at reachable services —
without them, `apps/api`'s `/health/ready` will correctly report both as
down rather than silently succeeding, and the worker's queue won't start
consuming jobs.

## What's genuinely runnable today vs. what needs credentials

| Capability                                            | Needs                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm build`/`lint`/`typecheck`/`test`                | nothing — pure Node/TS                                             |
| `/health/live`                                        | nothing                                                            |
| `/health/ready` reporting real status                 | Postgres + Redis reachable                                         |
| Deterministic scanning (Semgrep/Gitleaks/OSV-Scanner) | those binaries installed and on `PATH`/configured `*_BIN` env vars |
| AI-assisted analysis                                  | `AI_PROVIDER` + matching API key/URL                               |
| GitHub integration                                    | a registered GitHub App — see [github-app.md](github-app.md)       |
| Dynamic validation                                    | `HEXSTRIKE_ENABLED=true` + a reachable HexStrike server            |

None of the credentialed integrations are installed/configured in this
project's own development environment — see
[implementation-plan.md](implementation-plan.md) for exactly what has and
hasn't been exercised live.

## Demo mode

See [demo.md](demo.md).
