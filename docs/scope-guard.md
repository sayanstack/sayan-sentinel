# Scope Guard

Scope Guard is the deterministic security boundary in
`packages/hexstrike-adapter/src/scope-guard/` that sits between any
dynamic-validation request and HexStrike. It has no dependency on the AI
engine and cannot be influenced by anything the AI produces.

## Decision chain (`evaluateScopeGuard`)

Every request is evaluated through this exact sequence, and any failure
returns `allowed: false` immediately (fail closed):

1. **Parseable URL** with `http:` or `https:` scheme only.
2. **Not a bare localhost/loopback hostname** (`localhost`, `127.0.0.1`,
   `::1`) unless `localLabMode` is explicitly enabled.
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
  rather than silently incomplete).

A malformed IP is treated as **blocked**, not allowed — Scope Guard never
gives an unparseable input the benefit of the doubt.

## Local lab mode

`LOCAL_LAB_MODE=true` is the only way to allow a private/loopback target
through Scope Guard, and it is meant for exactly one thing: validating
findings against the bundled `examples/vulnerable-demo-app` fixture during
local development. It is not a general-purpose bypass — enabling it does
not disable authorization/tier/path checks, only the private-address
block.

## What executes the actual request

Scope Guard is a decision function — it does not make HTTP requests
itself. The `HexStrikeDynamicValidationProvider` in the same package calls
it unconditionally at the top of `validate()`, before checking which
capability was requested and before any HexStrike call. This ordering is
what makes "HexStrike cannot bypass Scope Guard" a property enforced by
the code path, not just a design intention — verified by a test asserting
the HexStrike client is never invoked when Scope Guard rejects the
request.

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

## Testing

35 tests across `ip-blocklist.test.ts`, `resolve-and-check.test.ts`, and
`scope-guard.test.ts` cover every rejection reason individually, a
DNS-rebinding scenario (hostname authorized, but an injected resolver
returns a private IP), a literal-cloud-metadata-IP scenario, and the
fully-valid pass-through case.
