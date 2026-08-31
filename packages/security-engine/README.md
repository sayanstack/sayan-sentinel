# @sayan-sentinel/security-engine

Deterministic scanner adapters — Semgrep (SAST), Gitleaks (secrets), OSV-Scanner (dependencies) — normalized into `@sayan-sentinel/findings`' `FindingDraft` model.

**Status:** all three adapters implemented against verified current tool JSON schemas. See [../../docs/implementation-plan.md](../../docs/implementation-plan.md) for detail.

## Design

Each adapter implements the same `ScannerAdapter` interface
(`checkAvailability()` / `scan()`), all shelling out via `execFile` with
argument arrays — never a shell. **If a tool isn't installed, the adapter
says so** (`{ status: "unavailable", reason }`) — it never fabricates a
clean scan or a fake version string. None of the three tools are installed
in this repository's development environment, so that path is what
actually runs today; install the real binaries (see below) to get real
scan results.

Gitleaks findings never carry the raw discovered secret past the
normalizer — `Secret`/`Match` are masked via `maskSecretValue` before a
`FindingDraft` is even constructed.

## Installing the underlying tools (optional, for real scans)

- Semgrep: `pip install semgrep` or see semgrep.dev
- Gitleaks: see github.com/gitleaks/gitleaks releases
- OSV-Scanner: see github.com/google/osv-scanner releases

Point an adapter at a non-default binary with `new SemgrepAdapter({ bin: "/path/to/semgrep" })` (same pattern for the other two).

## Testing

```bash
pnpm --filter @sayan-sentinel/security-engine test
```

Normalizer tests use fixtures shaped after each tool's documented JSON
schema. Adapter tests exercise the real "binary not found" path against a
deliberately nonexistent binary name — not mocked, genuinely spawned and
genuinely absent.
