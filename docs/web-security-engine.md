# Web Security Engine

`packages/web-security-engine` is the beginning of Sentinel's black-box
("Web Security") analysis surface from the Source-to-Runtime platform
specification — a passive analyzer for an authorized web target, built on
a Scope-Guard-enforcing HTTP client every rule shares.

**Scope of this pass**: the `SafeHttpClient` foundation the spec calls out
as mandatory ("ALL network traffic must go through the centralized
SafeHttpClient; no rule may instantiate its own HTTP client"), plus five
real passive rules built on it. The much larger remaining surface — the
bounded crawler/discovery engine, form/API discovery, TLS/mixed-content
analysis, the API Security Engine, Target Authorization persistence, and
everything in Full Stack Scan — is **not implemented** and is not claimed
to be. This is one real, tested slice, not the whole platform.

## SafeHttpClient

`http/SafeHttpClient.ts` is the single HTTP client every rule in this
package uses — there is no other way to make a request from this
package's code. Every request, including every redirect hop, goes through
five checks:

1. **Method allowlist** — defaults to `GET`/`HEAD` only; passive analysis
   never needs more, and a rule that thinks it needs `POST` is out of
   scope for this client entirely (Tier 2/3 state-changing requests are a
   different, not-yet-built code path with its own approval gate, per the
   Safety Tier model).
2. **Scope Guard**, via `@sayan-sentinel/hexstrike-adapter`'s
   `evaluateScopeGuard` — the exact same authorization/expiration/
   revocation/tier/path/IP-blocklist decision chain dynamic HexStrike
   validation uses. This is checked **again on every redirect hop**
   before it's followed: a request that starts at an authorized target
   and gets redirected to `evil.example.com` is refused at that hop, not
   followed and reported after the fact. This closes the "redirect
   escape" scenario `scope-guard.ts`'s own docstring calls out as a
   caller responsibility — here, the caller (this client) actually
   discharges it.
3. **Timeout** (default 10s) via `AbortController`.
4. **Response size cap** (default 2 MiB) — enforced _during transfer_ when
   the underlying response exposes a streaming body (real `fetch`
   responses do), not just by truncating a fully-buffered string
   afterward.
5. **Bounded redirect count** (default 5) — a redirect loop can't hang a
   scan indefinitely.

`Set-Cookie` headers are collected into their own `setCookieHeaders:
string[]` field rather than folded into the ordinary `headers` record —
a response can carry more than one `Set-Cookie` header, and their values
can't be safely comma-joined the way ordinary multi-value headers can (an
`Expires=Wed, 21 Oct ...` attribute contains a comma itself). The default
real-`fetch` implementation uses the standardized `Headers.getSetCookie()`
(Node 18.14.1+ / undici) specifically to avoid that trap.

Every dependency (the DNS resolver Scope Guard uses, the `fetch`
implementation itself) is injectable, so the full test suite — including
the redirect-escape and DNS-rebinding-adjacent scenarios — runs against
fakes with zero real network calls.

## Passive rules implemented

| Rule ID            | Title                             | What it checks                                                                                                                                                                                                                                                                |
| ------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SENTINEL-WEB-001` | Risky CORS Configuration          | Sends a request with a probe `Origin` header the target has never seen, and checks whether `Access-Control-Allow-Origin` reflects it (high, if combined with `Access-Control-Allow-Credentials: true`), or is a wildcard with credentials (medium), or a bare wildcard (info) |
| `SENTINEL-WEB-002` | Cookie Missing Secure Attribute   | Any `Set-Cookie` on an HTTPS response without `Secure`                                                                                                                                                                                                                        |
| `SENTINEL-WEB-003` | Cookie Missing HttpOnly Attribute | Any `Set-Cookie` without `HttpOnly`                                                                                                                                                                                                                                           |
| `SENTINEL-WEB-004` | Debug Information Exposure        | Response body matches a recognized framework debug-page or stack-trace signature (Node.js, Python, Django, Laravel, ASP.NET, PHP, .NET) — not any mention of the word "error"                                                                                                 |
| `SENTINEL-WEB-006` | Missing Transport Security Policy | HTTPS response with no `Strict-Transport-Security` header                                                                                                                                                                                                                     |

Severity discipline matches the platform-wide rule: a missing
hardening header is `low`/`info` (defense-in-depth, not directly
exploitable); a confirmed credential-reflecting CORS misconfiguration is
`high`. Cookie findings are name-based — a cookie whose name looks like a
session/auth token (`session`, `auth`, `token`, `jwt`, `sid`, ...) missing
an attribute is `medium`; an ordinary preference cookie (`theme`,
`locale`) missing the same attribute is `low`/`info`, never inflated to
match.

**Deferred** (documented, not implemented): `SENTINEL-WEB-005` (Sensitive
Response Caching) and `SENTINEL-WEB-007` (Unsafe Redirect Candidate) from
the specified rule catalog, the `SENTINEL-API-1xx` runtime-endpoint rules
(these need the API Security Engine and an OpenAPI/route inventory this
package doesn't have), TLS/certificate observations, mixed-content
detection, and technology fingerprinting.

## Orchestration

`engine/WebSecurityEngine.ts`'s `scanUrl(url, options)` runs every rule
above against one target through one shared `SafeHttpClient` instance and
returns `{ url, findings, fetchError? }`. A target Scope Guard denies, or
that's unreachable, produces a `fetchError` string — never a silently
empty findings array that could be misread as "scanned clean."

## Bounded crawler (`discovery/`)

`BoundedCrawler` is a conservative, same-origin-only, budget-bounded
crawler built entirely on `SafeHttpClient` — it makes no request of its
own; every page fetch goes through the same Scope Guard enforcement,
timeout, response cap, and redirect re-checking already described above.
It adds only discovery logic on top:

- **Same-origin only** — an external-origin link is recorded in
  `skippedExternal` and never followed, matching the spec's "never follow
  external domains/CDNs/analytics/ads/social unless independently
  authorized."
- **Budgets**: `maxDepth` (default 2), `maxPages` (default 25),
  `maxDurationMs` (default 30s) — hitting any of these sets
  `truncated: true` on the result rather than silently returning a
  partial view that looks complete.
- **`robots.txt` respected by default** (`respectRobotsTxt: true`) — a
  courtesy on top of, not instead of, the Scope Guard authorization
  boundary; a missing or unreachable robots.txt means "crawl everything
  in scope," not "avoid the site."
- **`sitemap.xml` seeding** (`fetchSitemapUrls`) — a separate, opt-in
  helper for discovering pages the crawler might not reach by following
  links alone.
- **Static assets skipped by default** (`.css`/`.png`/`.woff`/etc.) —
  never security-relevant to crawl into.
- **Dedup** — a URL is never fetched twice even if reachable from
  multiple pages.

Link/script/form extraction (`discovery/html-extract.ts`) is
deliberately **regex-based, not a full HTML/DOM parser** — this package
has no HTML-parsing dependency, matching the project's preference for
dependency-free, fully-auditable security-critical code (the same choice
`ip-blocklist.ts` makes). This is a documented limitation: severely
malformed markup or a client-side-rendered SPA's runtime-generated routes
can under-discover. Under-discovery is a completeness limitation, not a
safety one — every URL found is still routed through
`SafeHttpClient`/Scope Guard before ever being requested, so a rule this
package doesn't find is simply not analyzed, never analyzed unsafely.

Forms are discovered (action, method, field names) but **never
auto-submitted** — this only reads static markup, matching the spec's
explicit prohibition on auto-submitting state-changing forms during
discovery.

## What's NOT here

There is no endpoint/API discovery beyond what plain link-following and
sitemap parsing find (no OpenAPI import, no GraphQL introspection), no
authenticated-scan support (every crawl and passive check runs
unauthenticated — there's no `AuthenticationProfile` concept here yet),
and no wiring into the worker's job pipeline or the dashboard — nothing
in `apps/worker` yet calls `BoundedCrawler`/`scanUrl` as a real job type.
This package's connection to persisted state is one-directional: a
caller can look up a real `TargetAuthorization` via `apps/api/src/
targets/` (see [docs/target-authorization.md](target-authorization.md))
and convert it with `toScopeGuardRecord` into what `SafeHttpClient`
expects, but nothing here reaches into the database on its own — the
package stays persistence-independent by design, matching
`source-runtime-correlation`'s approach.

## Testing

73 tests across 10 files. `SafeHttpClient.test.ts` (11 — Scope Guard
enforcement, method allowlisting, the redirect-escape refusal, redirect-
count exhaustion, streamed-body truncation, timeout-vs-network-error
distinction, custom headers, Set-Cookie collection), the discovery suite
(`url-canonicalize.test.ts`, `html-extract.test.ts`,
`robots-sitemap.test.ts`, `BoundedCrawler.test.ts` — same-origin
enforcement, depth/page budget truncation, dedup, robots.txt respect,
form extraction, and a Scope-Guard-denial-recorded-not-thrown case), one
test file per
rule (true/false-positive cases, severity discipline), and
`WebSecurityEngine.test.ts` (orchestration, including the "unreachable
target reports fetchError" case). All against injected fakes — no real
network calls anywhere in the suite.
