# Scope Guard

Scope Guard is the deterministic security boundary in
`packages/security-core/src/scope-guard/` that sits between any
dynamic-validation request and the configured backend. It has no
dependency on the AI engine and cannot be influenced by anything the AI
produces.

## Decision chain (`evaluateScopeGuard`)

Every request is evaluated through this exact sequence, and any failure
returns `allowed: false` immediately (fail closed):

1. **Parseable URL** with `http:` or `https:` scheme only.
2. **Not a bare localhost/loopback hostname** (`localhost`, `127.0.0.1`,
   `::1`) unless `localLabMode` is explicitly enabled. An IPv6 literal in
   the URL is unwrapped from the brackets `URL.hostname` keeps around it
   (`"[::1]"` → `"::1"`) before this comparison — WHATWG's URL parser
   leaves the brackets on, so skipping this step would let `[::1]` slip
   past the fast-path check entirely (fixed; see the IP blocklist section).
3. **A matching authorization exists** — exact scheme + host + port match
   against the caller-supplied `TargetAuthorizationRecord[]`.
4. The matched authorization is **not revoked**, **not expired**, and has
   been **verified** (`verifiedAt` is set).
5. The requested **tier does not exceed** the authorization's `maxTier`.
6. The request **path matches an allowed path prefix** (or the
   authorization has none configured, meaning any path is in scope).
7. The hostname is **resolved fresh** and the resolved address is checked
   against the IP blocklist — not the hostname string. This is the
   specific defense against DNS rebinding: a domain could resolve to a
   public IP when first checked and a private one moments later, so the
   check re-resolves every time rather than trusting a cached or
   previously-approved hostname.

## IP blocklist

`ip-blocklist.ts` implements a small, dependency-free CIDR matcher (no
external IP-range library, since this is security-critical enough to want
full visibility into the exact ranges). Blocked by default:

- Loopback, RFC1918 private ranges, link-local (which covers the
  `169.254.169.254` cloud metadata endpoint), CGNAT, and the IANA
  reserved/test ranges (IPv4).
- Loopback, link-local, unique-local, and IPv4-mapped addresses (IPv6 —
  narrower coverage than IPv4, documented as a known scope limitation
  rather than silently incomplete). IPv4-mapped addresses are recognized
  in both textual forms Node can produce — dotted-decimal
  (`::ffff:127.0.0.1`) and hex-hextet (`::ffff:7f00:1`, what `net.isIP`
  and a normalized URL hostname actually use) — after a gap where only
  the dotted form was checked was found and fixed during Scope Guard V2
  hardening (see Known findings below).

A malformed IP is treated as **blocked**, not allowed — Scope Guard never
gives an unparseable input the benefit of the doubt.

### Known findings (found and fixed during hardening, not hypothetical)

While extending Scope Guard for Target Authorization v2, two related
bugs were found by testing actual Node.js URL-parsing behavior rather
than assuming it: `new URL("http://[::1]/").hostname` returns `"[::1]"`
with the brackets still attached, and `net.isIP("[::1]")` returns `0`
(not recognized as a literal IP) because of those brackets. The
practical effect: an IPv6-literal URL bypassed the fast-path localhost
check in `evaluateScopeGuard` (`"[::1]" !== "::1"`) and caused
`resolveAndCheckHost` to attempt a DNS lookup of the literal bracketed
string instead of recognizing it directly — which happened to still get
blocked on this system only because the OS resolver's `dns.lookup`
tolerated and normalized the bracketed input back to a bare address
before the blocklist check ran. That's not something to depend on across
platforms. Both bugs are fixed: `evaluateScopeGuard` strips the brackets
before any comparison, and `isBlockedIPv6` recognizes the IPv4-mapped
hex-hextet form directly. 3 regression tests lock this in.

## Local lab mode

`LOCAL_LAB_MODE=true` is the only way to allow a private/loopback target
through Scope Guard, and it is meant for exactly one thing: validating
findings against the bundled `examples/vulnerable-demo-app` fixture during
local development. It is not a general-purpose bypass — enabling it does
not disable authorization/tier/path checks, only the private-address
block.

## What executes the actual request

Scope Guard is a decision function — it does not make HTTP requests
itself. The `RemoteDynamicValidationProvider` in the same package calls
it unconditionally at the top of `validate()`, before checking which
capability was requested and before any backend call. This ordering is
what makes "the dynamic-validation backend cannot bypass Scope Guard" a
property enforced by the code path, not just a design intention —
verified by a test asserting the dynamic-validation client is never
invoked when Scope Guard rejects the request.

**For redirect handling**: whoever executes the validated HTTP request
downstream must call `evaluateScopeGuard` again on every redirect
`Location` header before following it, and abort if it comes back
disallowed. A single check against the original URL is not sufficient —
this is documented directly in `scope-guard.ts`'s function comment.

## Safety tiers

Only Tier 0 (`http_probe`, passive HTTP probing via httpx) and Tier 1
(`vulnerability_scan`, Nuclei) are implemented. `ValidationRequest`'s
`validationType` is a closed TypeScript union of just these two ids, so no
type-checked call site can even construct a request for a capability that
doesn't exist. Tier 2 (state-changing, requires explicit admin approval)
and Tier 3 (destructive) are not implemented at all — this is a defensive
security tool, not an autonomous exploitation platform.

## Target Authorization verification

`packages/security-core/src/target-verification/` implements the
domain-ownership proof `verifiedAt` on a `TargetAuthorizationRecord`
depends on — nothing sets that field without one of these actually
succeeding. Two methods, both modeled on the equivalent ACME (Let's
Encrypt) challenge types so the pattern is a well-understood one:

- **`dns_txt`** (`dns-txt.ts`) — the domain owner publishes
  `_sentinel-verification.<host>` TXT `sentinel-verification=<challenge>`;
  Sentinel looks it up itself (`dns.resolveTxt`, injectable for tests) and
  never trusts a caller's assertion that the record exists.
- **`http_well_known`** (`http-well-known.ts`) — the owner serves the
  challenge token verbatim at `GET /.well-known/sentinel-verification`.
  Before ever connecting, the target is resolved and checked against the
  **same** private/loopback/link-local blocklist `resolveAndCheckHost`
  uses for dynamic validation — verification must not itself become an
  SSRF primitive against internal infrastructure just because the target
  isn't authorized yet — and redirects are never followed, so
  verification can't be redirected to a different host than the one
  actually being verified. A 10-second timeout and a 4096-byte response
  cap bound the request.

`generateVerificationChallenge()` produces the random per-attempt token
(24 random bytes, hex-encoded) a domain owner publishes or serves;
`verifyTarget()` dispatches to the right method for a given
`VerificationTarget`. There is currently no persistence layer or API
endpoint wired to these functions yet — they are the verification
_primitives_ Target Authorization v2's create/verify/expire/revoke
workflow will call, built and tested in isolation first.

## Testing

78 tests across the package: `ip-blocklist.test.ts`,
`resolve-and-check.test.ts`, and `scope-guard.test.ts` cover every
rejection reason individually, a DNS-rebinding scenario (hostname
authorized, but an injected resolver returns a private IP), a
literal-cloud-metadata-IP scenario, the IPv6-bracket and IPv4-mapped
hex-hextet regressions above, and the fully-valid pass-through case;
`target-verification/*.test.ts` cover both challenge methods (match,
mismatch, resolution failure, non-2xx, oversized response, and the
private-address refusal) entirely against injected fakes — no real
network calls in the suite.
