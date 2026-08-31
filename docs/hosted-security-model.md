# Hosted Security Model

`SENTINEL_HOSTED_MODE` distinguishes the public, multi-tenant hosted
product (`sentinel.sayanstack.com`) from a self-hosted instance. Most of
what a "hosted mode" typically needs to enforce is **already true
unconditionally** in this codebase — Scope Guard always requires a
verified, unexpired, non-revoked authorization; the IP blocklist always
blocks private/loopback/link-local ranges unless `LOCAL_LAB_MODE`
explicitly opts out; only Tier 0/1 dynamic-validation capabilities exist
at all (Tier 2/3 are not implemented anywhere in the codebase, hosted or
not); every Target Authorization lifecycle transition already writes an
`AuditEvent` row (`docs/target-authorization.md`). Hosted mode does not
re-implement any of that — it exists for the _narrower_ set of things
that are legitimately configurable differently between a trusted
self-hosted operator and an anonymous multi-tenant hosted service.

## What `SENTINEL_HOSTED_MODE=true` actually does

Two **config-load-time interlocks** in `packages/config/src/schema.ts`
(a Zod `.superRefine()` cross-field check) — not documentation, not a
runtime warning, an actual failure to boot:

1. **Cannot be combined with `LOCAL_LAB_MODE=true`.** `LOCAL_LAB_MODE`
   exists specifically to let a private/loopback address through Scope
   Guard, for local demo purposes only. Combining it with hosted mode
   would let any authenticated hosted-product user direct a scan at
   internal infrastructure — this is caught at config load, not left as
   an operator convention that can be forgotten in a deployment
   checklist.
2. **`DYNAMIC_VALIDATION_MAX_TIER` cannot exceed `1`.** This is a
   forward-looking guard: Tier 2 (state-changing) and Tier 3
   (destructive) validation aren't implemented today, but the schema
   already accepts values up to `3` for a future self-hosted operator
   who might want to raise the ceiling once those tiers exist. Hosted
   mode caps it at `1` regardless, so that future capability can never
   accidentally ship enabled for anonymous hosted use.

Both are asserted by tests that actually call `loadConfig()` with the
conflicting combination and check it throws `ConfigValidationError` —
not just that the schema _looks_ like it should.

`features.hostedMode` is derived alongside the existing
`aiEnabled`/`githubAppEnabled`/`hexstrikeEnabled` flags, for any future
call site (API route, worker job) that needs to branch on it.

## What hosted mode does NOT change (because it was already true)

- Domain verification is already mandatory for every target — there is
  no code path that sets `verifiedAt` other than a genuine DNS TXT/HTTP
  well-known challenge succeeding (`docs/target-authorization.md`).
- Authorization expiration is already mandatory — `TargetAuthorization`
  has no way to be created without an `expiresAt`, capped at 365 days by
  `CreateTargetDto`.
- Private networks and localhost are already blocked by default —
  `LOCAL_LAB_MODE` is the only bypass, and (per above) hosted mode makes
  it impossible to combine the two.
- Tier 2/3 are already unavailable everywhere, hosted or not — the
  `ValidationRequest` type in `hexstrike-adapter` is a closed union of
  just the two implemented capabilities.
- Audit logging already happens unconditionally for every target
  lifecycle transition.

## What's still NOT here

No per-request/per-IP abuse rate limiting at the API layer (the
`DYNAMIC_VALIDATION_MAX_RPS`/`MAX_REQUESTS` limits exist for the dynamic
validation _provider_ itself, not for the public API surface), no
tenant-level quota enforcement, and no automated detection of a
`SENTINEL_HOSTED_MODE` deployment attempting to reach a
`LOCAL_LAB_MODE`-style target through some other path than the two
checked fields (this is a config-time interlock on the two settings that
matter, not a runtime firewall).

## Testing

7 new tests in `packages/config/src/load.test.ts`: hosted mode defaults
to off, enables via env var, refuses to load when combined with
`LOCAL_LAB_MODE`, refuses to load when the validation tier exceeds 1,
allows the default tier under hosted mode, and confirms a self-hosted
(non-hosted-mode) deployment can still use `LOCAL_LAB_MODE` or a higher
validation tier — the restriction is specific to hosted mode, not a
blanket lockdown.
