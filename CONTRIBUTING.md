# Contributing to Sayan Sentinel

## Development setup

```bash
git clone <repo-url> sayan-sentinel
cd sayan-sentinel
cp .env.example .env
pnpm install
docker compose up -d      # postgres, redis, minio
pnpm db:migrate
pnpm dev
```

See [docs/local-development.md](docs/local-development.md) for details.

## Project structure

This is a pnpm + Turborepo monorepo. See [docs/architecture.md](docs/architecture.md)
for what lives where.

- `apps/web` — Next.js frontend
- `apps/api` — NestJS API
- `apps/worker` — BullMQ job processors (ingestion, scanning, AI, dynamic validation)
- `packages/*` — shared libraries, one concern per package (see root README)
- `examples/vulnerable-demo-app` — intentionally vulnerable fixture used by the
  local demo; never treat findings against it as real disclosures

## Before opening a PR

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All four must pass. CI re-runs them regardless.

## Commit style

Conventional commits are preferred (`feat:`, `fix:`, `docs:`, `test:`, `chore:`)
but not strictly enforced pre-1.0.

## Security-sensitive changes

Changes touching `packages/hexstrike-adapter`, Scope Guard, authentication,
authorization, webhook verification, or secret handling require an explicit
call-out in the PR description of what was changed and why, plus the relevant
test coverage. See [docs/threat-model.md](docs/threat-model.md).

## Reporting bugs vs. vulnerabilities

Functional bugs: open a GitHub issue.
Security vulnerabilities: follow [SECURITY.md](SECURITY.md) — do not open a
public issue.
