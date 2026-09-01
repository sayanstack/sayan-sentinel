# Application Graph

`docs/full-stack-scan.md` documented this exact blocker: `run-full-stack-scan-pipeline.ts`
computes `code.graph` on every scan, but nothing ever persisted it — it
lived only in memory for the duration of the job. This phase closes that
gap, plus adds the read path and a UI: the "Code Graph" nav item, one of
the frontend's `NotImplementedPage` placeholders, now renders real data.

## Persistence

`packages/database/prisma/schema.prisma` adds `GraphNode`/`GraphEdge`,
both tied to `scanId` (cascade-deleted with their scan). Unlike `Finding`,
nothing is upserted or deduplicated across scans — each scan's graph is
an independent, complete snapshot, exactly mirroring what
`CodeGraphBuilderContext.toGraph()` produced for that run.
`kind`/`fromNodeExternalId`/`toNodeExternalId` are stored as plain
strings (not new Prisma enums mirroring `NodeKind`/`EdgeKind`) — a
deliberate choice to avoid yet another enum-mirroring maintenance
surface for a value that's purely descriptive/filterable, not used in
any `WHERE` clause that needs referential integrity.

`apps/worker/src/persistence/persist-scan-result.ts`'s `persistGraph()`
bulk-inserts via `createMany` (not an await-per-row loop, unlike
`upsertFinding`, since there's no per-row upsert logic needed) and is
skipped entirely — not called with an empty array — when a scan's graph
has zero nodes/edges.

## Reading it back

`RepositoriesService.getLatestGraphForUser` (`apps/api/src/repositories/`)
finds the repository's most recent **completed** scan and returns its
nodes/edges — `null` for the same missing-or-cross-tenant reasons as
`getRepositoryForUser`, but a real empty graph (`{scanId: null, nodes:
[], edges: []}`) for an accessible repository that simply hasn't
completed a scan yet, so the two "nothing to show" cases stay
distinguishable to the caller. Exposed at `GET /repositories/:id/graph`.

## The UI

`/code-graph` (`apps/web/src/app/code-graph/page.tsx`) is a real,
tenant-scoped server component: a repository picker, a node-count
summary by kind (routes, functions, classes, ...), and a table of up to
300 nodes (kind, name, file:line). **This is deliberately a set of
filterable tables, not a force-directed/interactive visual canvas** — the
nav item's placeholder copy previously promised "Interactive architecture
graph"; that copy has been corrected to describe what's actually built.
Building a real, correct, performant interactive graph-drawing UI (zoom,
drag, physics layout) is a substantial separate engineering effort;
shipping a working, honest table view of the real underlying data was
judged more valuable than an incomplete or fake-looking canvas.

Verified in-browser against the same fake-env compiled `apps/api` used in
prior phases: the page renders its header and a real `ErrorBanner`, with
the API log confirming the failure is the expected
`PrismaClientInitializationError` (no live Postgres), not a bug in the
new route. No React/hydration console errors.

## What's NOT here

- **No visual/interactive graph rendering** — see above.
- **No edge visualization at all in the UI yet** — edges are persisted
  and returned by the API, but the page currently only tables nodes; an
  edge list/adjacency view is a natural next increment.
- **Hard-capped at 300 nodes rendered** — a large repository's full graph
  isn't paginated, just truncated with a note.
- **Not verified against real data** — same sandbox limitation as every
  other phase this session (no Postgres/Redis here).
