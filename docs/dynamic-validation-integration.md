# Dynamic Validation Backend Integration

## Real interface, verified — not guessed

An external pentest-tooling MCP server was actually connected in the
environment this adapter was built in. Rather than guess at its REST API
shape, its passive, read-only tools (`server_health`, `get_telemetry`,
`nmap_scan` against a placeholder target, `get_process_status`) were
called against the (unreachable) local server, and the resulting
error messages reveal the genuine underlying endpoint URLs verbatim:

```
HTTPConnectionPool(host='127.0.0.1', port=8888): ... url: /health ...
HTTPConnectionPool(host='127.0.0.1', port=8888): ... url: /api/telemetry ...
HTTPConnectionPool(host='127.0.0.1', port=8888): ... url: /api/tools/nmap ...
HTTPConnectionPool(host='127.0.0.1', port=8888): ... url: /api/processes/status/1 ...
```

This confirms the backend's tools are a thin wrapper around a local REST
server (default `http://127.0.0.1:8888`) with the following surface:

| Method | Path                             | Used for                          |
| ------ | -------------------------------- | --------------------------------- |
| GET    | `/health`                        | health check                      |
| GET    | `/api/telemetry`                 | server telemetry                  |
| POST   | `/api/tools/<toolName>`          | execute a tool (body = tool args) |
| GET    | `/api/processes/status/<pid>`    | check a running job's status      |
| POST   | `/api/processes/terminate/<pid>` | cancel a running job              |

The `terminate` endpoint follows the same verified `/api/processes/.../<pid>`
convention but was **not independently confirmed** — an attempt to verify
it was blocked by this session's own auto-mode classifier (it looked like
a potentially destructive action, even though the target server was
unreachable). This is stated as inferred, not verified.

## `DynamicValidationHttpClient`

A thin, never-throwing HTTP client (`packages/security-core/src/client/`)
for the four confirmed endpoints. A connection failure, timeout, or
non-JSON response all come back as `{ success: false, error }` — the same
shape the backend's own server uses for a genuine tool error — so callers
have exactly one failure path, not a mix of thrown exceptions and
`success: false` payloads. Tested against a real local HTTP server spun up
in the test file, not a mocked `fetch`.

## `RemoteDynamicValidationProvider`

Implements the `DynamicValidationProvider` interface from Section 18:

```ts
interface DynamicValidationProvider {
  healthCheck(): Promise<ProviderHealth>;
  capabilities(): Promise<Capability[]>;
  validate(request: ValidationRequest): Promise<ValidationResult>;
  cancel(jobId: string): Promise<void>;
}
```

`validate()` calls [Scope Guard](scope-guard.md) unconditionally, before
checking which capability was requested and before any backend call —
see that document for why this ordering matters. Only two capabilities
are mapped to real backend tools:

- `http_probe` (Tier 0) → `httpx` (`probe`, `tech_detect`, `status_code`,
  `title`)
- `vulnerability_scan` (Tier 1) → `nuclei` (`severity: "low,medium"`)

A successful call returns `status: "inconclusive"` — this adapter
deliberately does not attempt to interpret the raw tool output into a
confirmed/rejected verdict; that's the evidence engine's job (not yet
built), which will have the specific finding's context to reason about,
rather than a generic pass/fail heuristic here.

## Not yet built

- The evidence engine that turns a dynamic-validation result into a
  Confirmed/Inconclusive/Failed finding-level verdict.
- Tier 2 (admin-approval-gated) capabilities.
- Running the backend itself in an isolated worker/container with
  resource limits (Section 23) — this adapter is the client side; the
  isolated execution environment for the backend's own process is
  deployment infrastructure, not code in this repository.

## Not exercised live

No dynamic-validation server was reachable in the environment this was
built in (`127.0.0.1:8888` refused every connection). The adapter's
"unavailable"/error-handling paths are what's actually been exercised end
to end here — tested with a fake client double for the orchestration
logic, and a real local HTTP server (not the actual backend) for the
`DynamicValidationHttpClient`'s request/response handling.
