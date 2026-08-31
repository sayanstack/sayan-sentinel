# @sayan-sentinel/api

NestJS API — auth, repository/scan/finding endpoints, webhook ingress, GitHub App callbacks, SSE/WebSocket updates.

**Status:** foundational skeleton implemented. See [../../docs/implementation-plan.md](../../docs/implementation-plan.md) for what's still pending.

## Implemented

- App bootstrap (`src/main.ts`) with `nestjs-pino` structured logging: per-request IDs
  (propagated via/echoed to `x-request-id`), and redaction of auth headers, cookies, and
  common secret-shaped fields before anything is logged.
- `SentinelConfigModule` — loads and validates environment config once at boot via
  `@sayan-sentinel/config`, exposed to the rest of the app via the `SENTINEL_CONFIG` token.
- `GET /health/live` — liveness probe, never touches a dependency.
- `GET /health/ready` — readiness probe (via `@nestjs/terminus`) that actually queries
  Postgres (`SELECT 1` through Prisma) and pings Redis, and reports each as up/down
  truthfully rather than assuming success.
- `GET /repositories/:id` — tenant-scoped repository lookup demonstrating
  `@sayan-sentinel/auth`'s cross-tenant access check end to end. Uses a
  `x-demo-user-id` header as a placeholder identity — real session auth
  isn't built yet. A cross-tenant request gets 404, not 403.

## Not yet implemented

Real session-based authentication, scan/finding endpoints, GitHub webhook
ingress, SSE/WebSocket updates.

## Running

Requires `DATABASE_URL` and `REDIS_URL` (see `.env.example`); without a reachable
Postgres/Redis, `/health/ready` will correctly report both as down.

```bash
pnpm --filter @sayan-sentinel/api build
pnpm --filter @sayan-sentinel/api start
```

## Testing

```bash
pnpm --filter @sayan-sentinel/api test        # unit tests
pnpm --filter @sayan-sentinel/api test:e2e    # e2e — asserts /health/ready is honest
```
