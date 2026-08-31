# @sayan-sentinel/web

Next.js (App Router) frontend — dark, premium theme per the product brief.

**Status:** two pages are real and connected to `apps/api`; the other eight nav items render an honest "Not implemented yet" state rather than fake data or a dead link.

## Implemented

- **Overview** (`/`) — Sentinel Security Score, repository/scan/finding
  counts, and open findings by severity, fetched live from
  `GET /dashboard/summary`.
- **Repositories** (`/repositories`) — the tenant-scoped repository list
  from `GET /repositories`.
- Both pages render a genuine error state (not fabricated data) when the
  API is unreachable or returns an error — verified in a browser with the
  API down (shows "Could not reach the Sentinel API") and with the API up
  but Postgres unreachable (shows the API's real 500).
- Sidebar navigation with all ten planned sections (Section 4), active-
  route highlighting, dark graphite theme with a subtle grid background
  and cyan → blue → violet accents (Tailwind CSS 4, `@theme` tokens in
  `src/app/globals.css`).

## Not yet implemented

Scans, Findings, Code Graph, Pull Requests, Policies, Integrations,
Activity, Settings — each renders `NotImplementedPage` rather than being
hidden or faked.

## Running

```bash
cp ../../.env.example ../../.env   # sets NEXT_PUBLIC_API_URL
pnpm --filter @sayan-sentinel/web dev
```

Requires `apps/api` running (and reachable Postgres/Redis for real data;
without them you'll see the honest error states described above, which is
also useful for verifying error handling).

## Testing

No component/e2e tests yet — `pnpm --filter @sayan-sentinel/web typecheck`
and `pnpm --filter @sayan-sentinel/web build` both pass, and the two live
pages were manually verified in a browser against a running API (both
reachable and unreachable) during development.
