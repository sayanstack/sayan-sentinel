# Security Policy

Sayan Sentinel is a security tool, so we hold it to a security tool's
standard for its own codebase.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, email **mertsayan1@gmail.com** with:

- a description of the issue and its impact
- steps to reproduce (proof-of-concept preferred)
- affected version/commit

We aim to acknowledge reports within 72 hours. Coordinated disclosure is
appreciated; we'll credit reporters in release notes unless anonymity is
requested.

## Scope

In scope:

- The Sentinel application (`apps/`, `packages/`)
- Scope Guard / dynamic-validation authorization logic
- The GitHub App integration and webhook handling
- The AI prompt-injection boundary

Out of scope:

- The bundled `examples/vulnerable-demo-app` fixture — its vulnerabilities are
  intentional and documented. Do not report them.
- Third-party tools Sentinel shells out to (Semgrep, Gitleaks, OSV-Scanner,
  and any configured external dynamic-validation backend) — report those
  upstream to their own maintainers.

## Supported versions

Pre-1.0: only the `main` branch receives security fixes.

See [docs/threat-model.md](docs/threat-model.md) and
[docs/security-model.md](docs/security-model.md) for the design-level
security architecture (Scope Guard, tenant isolation, secret redaction,
prompt-injection defenses).
