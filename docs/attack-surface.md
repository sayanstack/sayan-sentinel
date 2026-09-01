# Attack Surface

Closes the second half of the original "Application Graph & Attack
Surface UI" gap (see [docs/application-graph.md](application-graph.md)
for the first half). Like the graph, `web.crawl`/`routeCorrelation` were
computed on every Full Stack Scan but only ever lived in memory — there
was no persistence, no API, and no nav item for this at all.

## Persistence

`packages/database/prisma/schema.prisma` adds two models, both scan
-scoped and cascade-deleted like `GraphNode`/`GraphEdge`:

- `AttackSurfacePage` — one row per page `BoundedCrawler` discovered,
  present only for a scan that had a verified web target
  (`FullStackScanResult.web`). `forms` stores the real `DiscoveredForm[]`
  as JSON rather than a normalized child table — forms are read as a
  unit (never filtered/queried individually), so full normalization
  would add relational overhead for no query benefit.
- `RouteCorrelationSummary` — one row per scan (unique on `scanId`)
  summarizing `RouteCorrelationResult`: matched routes, unmatched runtime
  requests, unmatched source routes — also JSON, for the same reason.
  Present whenever source routes were extractable, **even for a code
  -only scan with no web target** (in which case every source route is
  trivially unmatched) — this is independent of `AttackSurfacePage`, not
  derived from it.

`persistScanResult`'s new `persistAttackSurface()` bulk-inserts pages via
`createMany` and creates at most one `RouteCorrelationSummary` row,
skipping either entirely when the corresponding data wasn't present on
the scan result — never called with an empty array or fabricated data.

## Reading it back

`RepositoriesService.getLatestAttackSurfaceForUser`
(`apps/api/src/repositories/`) — same latest-completed-scan lookup
(factored into a shared `findLatestCompletedScan` helper) and IDOR-safe
null-for-missing-or-cross-tenant pattern as `getLatestGraphForUser`.
Returns a real empty result (not `null`) for an accessible repository
with no completed scan yet. Exposed at
`GET /repositories/:id/attack-surface`.

## The UI

`/attack-surface` (`apps/web/src/app/attack-surface/page.tsx`) — a new
nav item (there was previously no "Attack Surface" entry in the sidebar
at all). Real, tenant-scoped server component: a repository picker, a
crawled-pages table (URL, depth, status, link/script counts, discovered
form methods+actions+field names), and a route-correlation summary
(runtime requests observed, routes matched, and a table of source routes
never observed at runtime — the routes most worth manually checking,
since they're either dead code or reachable only through a path the
crawler didn't find).

Verified in-browser the same way as every other phase: booted the
compiled `apps/api` against a fake `DATABASE_URL`/`REDIS_URL`, confirmed
the new nav item appears, and confirmed the page renders its real
`ErrorBanner` with the API log showing the expected
`PrismaClientInitializationError` — not a bug in the new route. No
React/hydration console errors.

## What's NOT here

- **Matched routes aren't rendered in the UI** — persisted and returned
  by the API (`routeCorrelation.matched`), but the page currently only
  surfaces the unmatched-source-routes table (the more actionable list
  for a first version).
- **No per-page form field risk analysis** — forms are shown as raw
  discovered data (method/action/fields), not cross-referenced against
  findings (e.g. "this form's `password` field has no CSRF token
  finding attached").
- **Not verified against real data** — same sandbox limitation as every
  other phase this session (no Postgres/Redis here).
