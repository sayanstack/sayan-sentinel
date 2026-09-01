# GitHub Webhook Receiver & Scan Triggering

Phase 31 built GitHub Check Run _reporting_ (`docs/github-app.md`) but left
a gap explicit in its own writeup: nothing in `apps/api` received a GitHub
webhook or enqueued a scan job at all, so no job in the codebase ever got
`github` populated end to end from a real `push`/`pull_request` event. This
phase closes that gap — `apps/api` now has a real webhook endpoint, and
`apps/worker`'s consumer side (which has existed since Phase 13) finally
has a producer.

## `@sayan-sentinel/queue`

A new shared package extracted from `apps/worker/src/queue/` —
`SCAN_QUEUE_NAME`, `ScanJobData`, `parseRedisConnection`, and
`createScanQueue`. Before this phase these lived only inside the worker
app, so `apps/api` had no way to import the exact same `ScanJobData` shape
or connect to the exact same queue without duplicating the type and the
Redis-connection-string parsing logic. Both `apps/worker` and `apps/api`
now depend on this package as their single source of truth.

**A real, previously-latent bug was caught building this package's first
test**: `SCAN_QUEUE_NAME` was `"sentinel:scan"` — BullMQ rejects `:` in
queue names (`Queue name cannot contain :`). Neither `createScanQueue` nor
`startScanWorker` had ever been constructed against a real BullMQ instance
before (`scan-queue.test.ts` is the first test to ever do so), so this
would have crashed the moment either one first ran against a real Redis.
Fixed to `"sentinel-scan"`.

## `apps/api/src/github/` — the webhook receiver

`POST /github/webhook` verifies the `X-Hub-Signature-256` HMAC (via
`@sayan-sentinel/github`'s existing `verifyWebhookSignature`, built in
Phase 12 but never called from any endpoint until now), checks
`X-GitHub-Delivery` against a Redis-backed `DeliveryStore`
(`RedisDeliveryStore`, new this phase — the package's own doc comment
called for a Redis-backed alternative to `InMemoryDeliveryStore`; `ioredis`
was already a dependency of `apps/api` for the Redis health check), then
dispatches on `X-GitHub-Event`:

- **`installation` (created)** — auto-provisions an `Organization` (named
  and slugified from the installing GitHub account) and an `Installation`
  row, then syncs any repositories included in the payload.
- **`installation` (suspend/unsuspend/deleted)** — updates
  `Installation.suspendedAt`. `deleted` (an uninstall) is deliberately
  treated the same as `suspend`, **never** a delete: an unattended webhook
  handler is not where an irreversible cascade-delete of historical
  `Scan`/`Finding` data should be triggered automatically.
- **`installation_repositories` (added)** — upserts the newly-added
  repositories. `removed` is intentionally a no-op — see "What's NOT
  here" below.
- **`push`** — for a repository Sentinel already has a `Repository` row
  for, enqueues a scan job (`trigger: "PUSH"`, `github: {installationId,
owner, repo}`) with an authenticated clone URL built from a fresh
  installation access token (`GitHubAppClient.createInstallationAccessToken`,
  new this phase). Branch-deletion pushes (`deleted: true` or an
  all-zero `after` SHA) are ignored. An unregistered repository is a
  no-op — nothing auto-registers a `Repository` row from a bare push.
- **`pull_request` (opened/synchronize/reopened)** — same, using the PR's
  head commit, `trigger: "PULL_REQUEST"`.

Every enqueue and installation/uninstall event writes an `AuditEvent` row
via the existing `writeAuditEvent`.

`main.ts` now boots Nest with `{ rawBody: true }` — `req.rawBody` (exact
bytes) is available for signature verification on every request while
`req.body` is still parsed as JSON as usual for every other route.

**Verified against real Node, not just typecheck/tests**: `packages/github`
re-exports `GitHubAppClient`, which imports `@octokit/app` — an ESM-only
package (`"type": "module"`, no CJS build). The compiled `apps/api`
successfully boots under real Node (22+, which natively supports
`require()`-ing synchronous ESM) with every route — including
`POST /github/webhook` — mapped correctly; the only failures were the
expected `ECONNREFUSED` against a Redis/Postgres this sandbox doesn't
have. Jest's own CJS module loader can't do that ESM interop, so
`github-webhook.controller.spec.ts` mocks `@sayan-sentinel/github` with
faithful reimplementations of the two pure functions it calls, rather
than dragging the octokit import chain into ts-jest — the real
implementations already have their own dedicated tests in
`packages/github` (run under vitest, which handles the ESM chain fine).

## What's NOT here (explicitly deferred)

- **No claim/invite flow.** A newly auto-provisioned `Organization` has
  zero `Membership` rows — there's no authenticated user in a
  server-to-server webhook request to attach one to. Until a real
  "connect this installation to my account" flow exists, nobody can see
  that organization through the demo-user-gated dashboard endpoints. This
  is a real, acknowledged product gap, not something this phase pretends
  to solve.
- **`repositories_removed` is a no-op.** Sentinel doesn't track
  per-repository access revocation independent of the whole installation;
  a repository whose access was removed stays in Sentinel's inventory
  until a future full-sync feature exists.
- **No branch filtering.** Every push to every branch of a registered
  repository triggers a scan — no default-branch-only or allow-list
  option yet.
- **`pullRequestNumber` isn't persisted.** The `Scan.pullRequestNumber`
  column exists in the schema but nothing populates it yet, including
  this webhook path.
- **No graceful shutdown for the queue/Redis connections** this module
  opens (`SCAN_QUEUE`, the delivery-store's `ioredis` client) — unlike
  `apps/worker`'s explicit `SIGTERM`/`SIGINT` handling, `apps/api` relies
  on the process exiting to close these.
- **Still requires real infrastructure to prove end to end.** This
  environment has no live Redis, Postgres, or GitHub App credentials, so
  the webhook path is verified by: real signature/HMAC math in tests,
  real Prisma call assertions, and a real compiled-Node boot confirming
  every route maps and no import crashes — not by an actual GitHub
  delivery reaching an actual running instance.
