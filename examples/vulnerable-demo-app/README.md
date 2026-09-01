# Sentinel Lab (vulnerable demo app)

**A deliberately vulnerable local training fixture. Never deploy this
publicly. Never report its findings as real disclosures.**

This exists so Sayan Sentinel's local demo mode has real, safe, reproducible
findings to show — no fabricated scan results, no fake vulnerability
counts — against both the source code (SAST) and the running application
(passive web security analysis, Full Stack Scan, Target Authorization).
Every issue below is intentional, and none of the "secrets" in this
fixture are real credentials.

## Intentional vulnerabilities

| Location | Issue | CWE / category |
|---|---|---|
| `src/app.js` — `STRIPE_API_KEY_FAKE` | Hard-coded secret (fabricated, not a real key) | CWE-798 |
| Global middleware | Insecure CORS — wildcard origin with credentials enabled | CWE-942 |
| `GET /api/orders/:id` | Broken object-level authorization — no ownership check | CWE-639 (OWASP API1:2023) |
| `GET /api/invoices/:id` | A second, independently-written BOLA instance on a different resource | CWE-639 (OWASP API1:2023) |
| `PATCH /api/users/:id` | Mass assignment — request body applied with no field allowlist | CWE-915 |
| `POST /api/admin/reset` | Trusts a client-supplied `role` claim instead of a real session | CWE-602 (OWASP API5:2023) |
| `GET /redirect` | Open redirect via unsanitized `?url=` | CWE-601 |
| `GET /files/:name` | Path traversal — no `..` / absolute-path check | CWE-22 |
| `POST /preview-template` | `eval()` on user-controlled input | CWE-95 |
| `GET /search` | Reflected XSS — unescaped query param in an HTML response | CWE-79 |
| `GET /fetch-url` | SSRF — fetches any caller-supplied URL, no allowlist | CWE-918 |
| `POST /ping` | OS command injection via string-concatenated shell command | CWE-78 |
| `GET /api/lookup` | String-concatenated query (SQL-injection-shaped) | CWE-89 |
| `POST /api/mongo-login` | Unvalidated request body passed straight into a query filter (NoSQL-injection-shaped) | CWE-943 |
| `GET /api/admin` | Broken JWT verification — payload decoded, signature never checked | CWE-347 |
| `POST /login` | Session cookie missing `Secure`/`HttpOnly` | CWE-614 / CWE-1004 |
| `GET /crash` | Verbose error handler — leaks the full stack trace to the client | CWE-209 |
| `package.json` — `lodash@4.17.15` | Known-vulnerable dependency pin (prototype pollution, CVE-2020-8203 and others) | dependency |

## What Sentinel actually detects here, verified

Not every listed vulnerability is caught by Sentinel's current rule set —
stated plainly rather than implied otherwise. See
[docs/sentinel-lab.md](../../docs/sentinel-lab.md) for the full, verified
breakdown (which rule catches what, and why a few don't yet — including
two real rules-engine gaps this fixture's construction surfaced and one
of which was fixed as a direct result).

## Running it

```bash
cd examples/vulnerable-demo-app
npm install
npm start   # listens on :4100 by default (:4177 etc. via DEMO_PORT=<port>)
```

Or via the repo's `docker-compose.yml` (`sentinel-lab` service) — see
[docs/sentinel-lab.md](../../docs/sentinel-lab.md).

Dynamic validation / live scanning may only ever target this fixture, and
only with `LOCAL_LAB_MODE=true` plus a verified `TargetAuthorization` for
it — see [../../docs/scope-guard.md](../../docs/scope-guard.md). Every
route above is genuinely exploitable once running (verified with real
`curl` requests while building this fixture), not just statically present.

## Analyzing it with Sentinel

Point repository ingestion at this directory (or a fork containing it) for
the code-level pipeline — code graph, deterministic scanners, correlation,
and the Sentinel Security Score. Point a Full Stack Scan at a running
instance (with a verified Target Authorization) to also exercise the Web
Security Engine and source-to-runtime route correlation against it.
