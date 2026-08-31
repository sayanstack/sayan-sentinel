# Sentinel vulnerable demo app

**A deliberately vulnerable local training fixture. Never deploy this.
Never report its findings as real disclosures.**

This exists so Sayan Sentinel's local demo mode has real, safe, reproducible
findings to show — no fabricated scan results, no fake vulnerability
counts. Every issue below is intentional, and none of the "secrets" in
this fixture are real credentials.

## Intentional vulnerabilities

| Location | Issue | CWE / category |
|---|---|---|
| `src/app.js` — `STRIPE_API_KEY_FAKE` | Hard-coded secret (fabricated, not a real key) | CWE-798 |
| `GET /api/orders/:id` | Broken object-level authorization — no ownership check | CWE-639 (OWASP API1:2023) |
| `GET /redirect` | Open redirect via unsanitized `?url=` | CWE-601 |
| `GET /files/:name` | Path traversal — no `..` / absolute-path check | CWE-22 |
| `POST /preview-template` | `eval()` on user-controlled input | CWE-95 |
| `GET /api/lookup` | String-concatenated query (SQL-injection-shaped) | CWE-89 |
| `package.json` — `lodash@4.17.15` | Known-vulnerable dependency pin (prototype pollution, CVE-2020-8203 and others) | dependency |

## Running it (optional — only needed to exercise it live, not to scan it)

```bash
cd examples/vulnerable-demo-app
npm install
npm start
```

Dynamic validation may only ever target this fixture, and only with
`LOCAL_LAB_MODE=true` — see [../../docs/scope-guard.md](../../docs/scope-guard.md).

## Analyzing it with Sentinel

Point repository ingestion at this directory (or a fork containing it) to
see the full pipeline — code graph, deterministic scanners (where
installed), correlation, and the Sentinel Security Score — against real,
intentional findings instead of a live target.
