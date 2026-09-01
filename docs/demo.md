# Local Demo

Sentinel's local demo mode runs real analysis against a bundled fixture —
["Sentinel Lab"](../examples/vulnerable-demo-app) — so a recruiter or
reviewer can see the pipeline work without needing an AI provider key or a
GitHub App registration. See [docs/sentinel-lab.md](sentinel-lab.md) for
the full, expanded writeup (18 intentional vulnerabilities, verified
detection results, and two real rules-engine bugs its construction found
and fixed) — this page stays focused on the "how do I run it" quick-start.

## What the fixture is

A small, standalone Express app with 18 intentional, CWE-tagged
vulnerabilities spanning both source-code issues (hard-coded secret,
broken object-level authorization, path traversal, command injection,
SSRF, `eval()` on user input, ...) and running-application issues
(insecure CORS, a cookie missing `Secure`/`HttpOnly`, verbose error
disclosure) — the latter added specifically so the app is also a real
target for the Web Security Engine and Full Stack Scan, not just static
analysis. See its own [README](../examples/vulnerable-demo-app/README.md)
for the full list. It is never deployed publicly and is excluded from the
pnpm workspace, so it is only ever an ingestion/scan target, never
built/linted as part of this repository.

## What genuinely works against it today

- **Ingestion + code graph**: `packages/code-intelligence`'s real file
  walker and `ts-morph`-based AST builder run against this fixture on
  disk. Verified by an integration test asserting all of its routes and
  its `DEMO_PORT` environment-variable usage are correctly detected —
  this is checked in CI, not just claimed here.
- **The full worker pipeline** (`runScanPipeline`/`runFullStackScanPipeline`)
  can run against it: clone/point at the directory → walk → build graph →
  run whichever scanners are installed → correlate → score → evaluate
  policy → (for a Full Stack Scan against a running, verified instance)
  crawl + Web Security Engine analysis + route correlation.
- **Sentinel's own rules engine** (no external tools, no AI key needed) —
  verified findings against this exact fixture: see
  [docs/sentinel-lab.md](sentinel-lab.md)'s detection table.
- **Persistence and the dashboard UI**: a scan's `Scan`/`Finding`/graph/
  attack-surface rows are written for real (`persistScanResult`) and
  readable from `apps/web`'s Scans/Findings/Code Graph/Attack Surface
  pages — see [docs/dashboard-persistence.md](dashboard-persistence.md),
  [docs/dashboard-scans-findings.md](dashboard-scans-findings.md),
  [docs/application-graph.md](application-graph.md), and
  [docs/attack-surface.md](attack-surface.md).

## What requires tools this environment doesn't have installed

Semgrep, Gitleaks, and OSV-Scanner are not installed here, so their actual
findings against this fixture haven't been demonstrated live — install
them (see [`packages/security-engine`'s README](../packages/security-engine/README.md))
to see real findings for the hard-coded secret, the injection-shaped
patterns, and the vulnerable `lodash` pin.

## Dynamic validation against the fixture

Only ever with `LOCAL_LAB_MODE=true` — see [scope-guard.md](scope-guard.md)
for exactly what that does and doesn't bypass. Run the fixture locally
first:

```bash
cd examples/vulnerable-demo-app
npm install
npm start   # listens on :4100 by default
```

## Running the demo end to end

```bash
cp .env.example .env
pnpm install
docker compose up -d   # postgres, redis, minio
pnpm --filter @sayan-sentinel/code-intelligence test   # includes the demo-fixture integration test
```

A full "run a scan against the demo fixture and see it in the UI" flow is
now buildable end to end (persistence and the relevant dashboard pages
both exist — see above) — it just requires a real Postgres/Redis, which
`docker compose up` provides and which this sandboxed environment doesn't
have, so it hasn't been exercised against a live database here. See
[implementation-plan.md](implementation-plan.md) for current status.
