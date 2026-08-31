# Local Demo

Sentinel's local demo mode runs real analysis against a bundled fixture —
[`examples/vulnerable-demo-app`](../examples/vulnerable-demo-app) — so a
recruiter or reviewer can see the pipeline work without needing an AI
provider key or a GitHub App registration.

## What the fixture is

A small, standalone Express app with seven intentional, CWE-tagged
vulnerabilities (hard-coded fake secret, broken object-level
authorization, open redirect, path traversal, `eval()` on user input, a
SQL-injection-shaped query, and a pinned known-vulnerable dependency). See
its own [README](../examples/vulnerable-demo-app/README.md) for the full
list. It is never deployed and is excluded from the pnpm workspace, so it
is only ever an ingestion target, never built/linted as part of this
repository.

## What genuinely works against it today

- **Ingestion + code graph**: `packages/code-intelligence`'s real file
  walker and `ts-morph`-based AST builder run against this fixture on
  disk. Verified by an integration test asserting all five of its routes
  and its `DEMO_PORT` environment-variable usage are correctly detected —
  this is checked in CI, not just claimed here.
- **The full worker pipeline** (`runScanPipeline`) can run against it:
  clone/point at the directory → walk → build graph → run whichever
  scanners are installed → correlate → score → evaluate policy.

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

A full "run a scan against the demo fixture and see it in the UI" flow
requires the frontend and findings-persistence layer, which are not yet
built — see [implementation-plan.md](implementation-plan.md) for current
status.
