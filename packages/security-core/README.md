# @sayan-sentinel/security-core

Scope Guard (the deterministic authorization/SSRF boundary for dynamic
validation) and the remote dynamic-validation provider.

**Status:** both implemented against verified real interfaces. See [../../docs/implementation-plan.md](../../docs/implementation-plan.md) for full detail.

## Scope Guard (`src/scope-guard/`)

The security boundary Section 19-20 requires to sit _outside_ the AI and
gate every dynamic-validation request:

- Blocks localhost/private/link-local/cloud-metadata addresses by default;
  `localLabMode` is the only override, and even then Scope Guard itself
  doesn't decide what may run against local targets — that's enforced by
  the caller only ever setting `localLabMode: true` against the bundled
  demo fixture.
- Re-resolves every hostname at check time and checks the _resolved_
  address, not the hostname string — the specific defense against DNS
  rebinding.
- Requires a matching, non-revoked, unexpired, **verified** authorization
  for the exact scheme+host+port, at or under its authorized tier, within
  an allowed path prefix.
- Fails closed on every ambiguous case.

## Dynamic validation client (`src/client/`, `src/provider.ts`)

Built against a real REST API shape (`GET /health`, `GET
/api/telemetry`, `POST /api/tools/<name>`, `GET
/api/processes/status/<pid>`) for a configurable external
dynamic-validation backend, verified by inspecting real connection
-refused error text against a local instance in this environment rather
than guessing.

`RemoteDynamicValidationProvider.validate()` calls Scope Guard
unconditionally, before anything else — the backend cannot be reached
from this adapter without passing that check first, which is what makes
"scope guard cannot be bypassed" a property of the code, not just a
policy.

Only two capabilities are offered: `http_probe` (Tier 0, httpx) and
`vulnerability_scan` (Tier 1, Nuclei). Tier 2/3 are not implemented.

## Testing

```bash
pnpm --filter @sayan-sentinel/security-core test
```

The HTTP client is tested against a real local HTTP server spun up in the
test file. The provider is tested with an injected fake client (the HTTP
layer has its own coverage already) so the Scope Guard-enforcement logic
is exercised directly and fast.
