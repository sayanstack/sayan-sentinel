# Dashboard: Scans & Findings pages

`docs/dashboard-persistence.md` closed the write side of the gap — every
completed scan writes a real `Scan` row and upserts real `Finding` rows.
This phase closes the read side for two of the remaining `NotImplementedPage`
placeholders: **Scans** and **Findings** now render real, tenant-scoped
data instead of a "not built yet" notice.

## Backend

- `GET /scans` (`apps/api/src/scans/`) — every `Scan` for a repository
  owned by any organization the caller (`x-demo-user-id`) is a member of,
  newest first, capped at 100, with `repository: {owner, name}` joined in
  so the UI doesn't need a second round trip per row.
- `GET /scans/:id` — single scan, same "null for both missing and
  cross-tenant" IDOR pattern as `RepositoriesService.getRepositoryForUser`
  (`ScansService.getScanForUser`).
- `GET /findings` (`apps/api/src/findings/`) — every `Finding` for a
  repository owned by any organization the caller is a member of, capped
  at 200, with optional `?repositoryId=`/`?severity=`/`?status=` query
  filters (invalid enum values are silently ignored rather than causing a
  500 — an unrecognized filter degrades to "no filter," not an error).

**A real ordering bug was caught and avoided, not shipped**: `Severity` is
a Prisma enum (`CRITICAL, HIGH, MEDIUM, LOW, INFO`), and Prisma's
`orderBy` on an enum column sorts alphabetically — `CRITICAL, HIGH, INFO,
LOW, MEDIUM` — not by actual severity priority. `INFO` would have sorted
third instead of last. `FindingsService` orders by `updatedAt` in the
query, then re-sorts the (capped, already-small) result set in
application code against an explicit `SEVERITY_RANK` table — the same
kind of explicit-priority-table pattern already used in
`build-check-run-summary.ts`'s `SEVERITY_ORDER`. A dedicated test
(`"sorts results by severity priority, not the enum's alphabetical
order"`) pins this down.

## Frontend

`apps/web/src/app/scans/page.tsx` and `.../findings/page.tsx` replace
their `NotImplementedPage` placeholders with real server components,
following the exact pattern already established by
`apps/web/src/app/repositories/page.tsx`: fetch on the server, render an
`ErrorBanner` on failure (never a silent empty table), render a real
"nothing here yet" empty state when the list is genuinely empty, render a
real table otherwise. No client-side interactivity was added (no
pagination, filtering, or sorting controls in the UI yet) — kept to
exactly what's needed to show real data.

**Verified in-browser** (not just typecheck/lint/build/test): booted the
compiled `apps/api` against the same fake `DATABASE_URL`/`REDIS_URL` used
in Phase 32's verification, started the real Next.js dev server, and
navigated to both `/scans` and `/findings`. Both rendered their header
and a real `ErrorBanner` correctly, with the API's own log confirming the
error is exactly the expected `PrismaClientInitializationError: Can't
reach database server at localhost:5432` — not a bug in the new routes.
No React/hydration console errors from either page (only the sandbox's
usual HMR/WebSocket proxy noise, present on every page regardless of this
change).

## What's NOT here

- **No pagination.** Both endpoints hard-cap results (100 scans, 200
  findings) rather than paging — fine for a demo/early-stage dataset, not
  for a repository with a long scan history.
- **No triage UI.** `Finding.status` (open/confirmed/false_positive/...)
  can only be changed by re-running a scan today (and even then,
  `persistScanResult` never touches `status` on update) — there's no
  "mark as false positive" button anywhere yet.
- **Not verified against real data.** This sandbox has no Postgres/Redis
  (see Phase 32's note on the same limitation) — the query logic and
  tenant-scoping are proven by unit tests against a mocked Prisma client,
  and the page wiring is proven by a real (if DB-less) end-to-end boot,
  not by an actual populated database.
