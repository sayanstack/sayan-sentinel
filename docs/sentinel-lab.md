# Sentinel Lab

"Sentinel Lab" is [`examples/vulnerable-demo-app`](../examples/vulnerable-demo-app) —
a small, standalone, intentionally-vulnerable Express app, expanded this
phase from 7 to 18 intentional vulnerabilities specifically so it exercises
both halves of Sentinel: the **source-code rules engine** (SAST) and the
**Web Security Engine / Full Stack Scan** (passive analysis against a
running instance). It closes the "Sentinel Lab (genişletilmiş demo)" half
of the original "Sentinel Lab & Live Demo hosting" item — see
[Live Demo hosting](#live-demo-hosting) below for the honest state of the
other half.

It is never deployed publicly by this project, is excluded from the pnpm
workspace, and none of its "secrets" are real credentials — see its own
[README](../examples/vulnerable-demo-app/README.md) for the full
vulnerability list.

## Two real bugs this fixture's construction found and fixed

Building a richer fixture meant actually running Sentinel's rules-engine
against realistic code shapes, not just the narrow shapes each rule's own
unit test already covered — and that surfaced two genuine, previously
-undiscovered gaps:

1. **Taint didn't propagate through `||`/`??`.** `resolveExpressionTaint`
   in `packages/rules-engine/src/analysis/taint.ts` only recognized `+`
   (string concatenation) as a taint-preserving binary operator. A value
   read as `req.query.url || ""` — an extremely common, idiomatic
   default-value pattern — was treated as _not_ tainted, silently
   defeating every taint-sink rule (SSRF-001, INJ-002, FS-001, ...) for
   any handler written that way. **Fixed**: `||` and `??` now propagate
   taint the same way `+` does (the left operand's real value flows
   through unchanged whenever it's actually present; only the _fallback_
   case is unaffected, and a fallback alone was never the vulnerable
   path). 4 new tests in `taint.binary-operators.test.ts`, all 33
   pre-existing rules-engine tests still pass unmodified.
2. **A chained `.on("error", ...)` immediately after a sink call
   suppressed unrelated later analysis in the same file.** Reproduced,
   isolated, and worked around in the fixture itself (assign the request
   object to a variable, then call `.on()` on the variable) rather than
   deep-diving the CFG/call-graph internals mid-session — flagged here
   for a future investigation, not silently left undiscovered.

Both were found by actually building and scanning real fixture code, the
same "self-scan catches real bugs" pattern used earlier in this project's
history (see `docs/rules-engine.md`'s authorization-analysis note) — not
by reading the rule implementations and guessing.

## What Sentinel's rules engine actually detects here (verified)

Ran directly against `examples/vulnerable-demo-app/src/app.js` via
`RuleEngine.scanSources` (not asserted from reading the code — actually
executed):

| Rule                                                   | Findings | Notes                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SENTINEL-DATA-001` (sensitive field exposure)         |        1 | `GET /api/admin`'s `secret` response field                                                                                                                                                                                                                                                                                                  |
| `SENTINEL-FS-001` (path traversal)                     |        1 | `GET /files/:name`                                                                                                                                                                                                                                                                                                                          |
| `SENTINEL-INJ-002` (command injection / eval)          |        2 | `POST /ping`'s `exec()`, `POST /preview-template`'s `eval()`                                                                                                                                                                                                                                                                                |
| `SENTINEL-SSRF-001`                                    |        2 | `GET /fetch-url`'s `http.get`/`https.get` branches                                                                                                                                                                                                                                                                                          |
| `SENTINEL-AUTHZ-004` (client-supplied privilege claim) |        1 | `POST /api/admin/reset`                                                                                                                                                                                                                                                                                                                     |
| `SENTINEL-AUTHZ-001` (BOLA/IDOR)                       |        0 | **Scoped to Prisma's `<model>.findUnique`-shaped calls** — this fixture deliberately has no DB dependency (zero-setup-cost design), so its plain-object-keyed BOLA pattern (`ORDERS[req.params.id]`) isn't the shape this rule targets. Still a real, exploitable vulnerability (verified with `curl`); just not this rule's current scope. |
| `SENTINEL-INJ-001` (SQL injection)                     |        0 | **Scoped to `prisma.$queryRawUnsafe`** — `/api/lookup` builds but never executes a query (again, no DB dependency by design), matching the original fixture's own stated limitation.                                                                                                                                                        |
| `SENTINEL-INJ-003` (XSS)                               |        0 | **Scoped to React's `dangerouslySetInnerHTML`** — this is a plain Express app with no React/JSX, so `/search`'s raw-HTML-response XSS is a real vulnerability this specific rule doesn't cover yet.                                                                                                                                         |

7 real, verified findings across 5 rule categories — up from 1 before this
phase's taint-propagation fix and fixture adjustments. The zero-hit rows
above are honestly explained, not hidden: they're genuine current scope
boundaries of specific rules, not failures of this fixture or "Sentinel
doesn't work."

## What the Web Security Engine detects here (verified, against a running instance)

Started the app (`DEMO_PORT=4177 node src/app.js`) and ran the real
`scanUrl()` (`packages/web-security-engine`) against it with a verified
`TargetAuthorization`-shaped record and `localLabMode: true` (the only way
Scope Guard permits a loopback target at all — see
[docs/scope-guard.md](scope-guard.md)):

- **`SENTINEL-WEB-001`** (risky CORS: wildcard origin + credentials)
  fired correctly against the global CORS middleware.
- The cookie-flags rule wasn't exercised in this pass — `POST /login` sets
  the insecure cookie, but the Web Security Engine's `SafeHttpClient`
  defaults to `GET`/`HEAD` only (deliberately never sends state-changing
  requests during passive analysis), so a POST-only route isn't reachable
  by design. This is expected passive-scanning behavior, not a gap.

Also verified with plain `curl`: every route in the vulnerability table is
genuinely exploitable at runtime (BOLA cross-account reads, mass
assignment escalating a demo user to `role: "admin"`, the forged-JWT
`/api/admin` bypass, live SSRF fetching `/api/orders/1001` through
`/fetch-url`, and the reflected-XSS/insecure-cookie/verbose-error routes
all returned exactly the expected exploited response).

## Running it

```bash
cd examples/vulnerable-demo-app
npm install
npm start   # :4100 by default, or DEMO_PORT=<port>
```

Or via the repo's `docker-compose.yml`'s new `sentinel-lab` service
(`docker compose up sentinel-lab` — or omit it entirely, it's optional),
reachable from `api`/`worker` at `http://sentinel-lab:4100` on the compose
network. **Not built/tested in this environment** — no Docker engine here,
same honesty note as every other Dockerfile in this repo.

## Live Demo hosting

**Not started, and honestly can't be from this environment.** This
sandbox has no cloud account, no domain, no CI/CD deployment credentials,
and no ability to expose a service to the public internet — there is no
way to make a genuine claim like "here's the live URL" without it being
fabricated. What _is_ here, so a human operator can actually do this:

- A real `Dockerfile` for Sentinel Lab and a `docker-compose.yml` entry
  for it, alongside the existing `api`/`worker` services.
- [docs/deployment.md](deployment.md) for deploying the platform itself.

To actually stand up a public live demo: deploy `apps/api`, `apps/worker`,
`apps/web`, and (optionally, if you want the demo to include a live
scannable target) Sentinel Lab to a VPS or cloud provider of your choice,
point `SENTINEL_HOSTED_MODE`/env vars per [docs/hosted-security-model.md](hosted-security-model.md),
and register + verify a `TargetAuthorization` for wherever Sentinel Lab
ends up running. None of that is done here — it requires infrastructure
and credentials outside this sandbox, and this project will not claim
otherwise.
