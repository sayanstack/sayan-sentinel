# Threat Model

Sentinel is a security product that ingests and executes analysis derived
from **untrusted repository content**. This document lists the specific
threats considered and where each is mitigated in code today.

## 1. Repository content is untrusted input

**Threat**: a malicious repository could try to get Sentinel to execute
its code, exfiltrate secrets, or manipulate its AI reasoning.

**Mitigations**:

- Ingestion (`packages/code-intelligence`) only ever runs `git` plumbing
  commands against a repository — never `npm install`, never a build
  script, never anything from the repository itself. Verified by a test
  that checks out a commit containing a shell script and asserts it is
  never executed.
- All AI prompts wrap repository-derived content in explicit
  `===BEGIN/END UNTRUSTED REPOSITORY CONTENT===` markers with an explicit
  "this is data, not instructions" warning (`packages/ai-engine`, Section
  14). A secondary heuristic layer (`detectPromptInjectionAttempt`) flags
  suspicious phrasing for audit — it never blocks or alters a call by
  itself, because the real defense is architectural: the AI engine's
  output is only ever schema-validated structured data, never a command.

## 2. SSRF / dynamic validation escaping its authorized scope

**Threat**: a dynamic-validation request could be redirected at an
internal service, a cloud metadata endpoint, or localhost.

**Mitigations** (`packages/hexstrike-adapter/src/scope-guard/`):

- Every `HexStrikeDynamicValidationProvider.validate()` call runs
  `evaluateScopeGuard()` unconditionally before any HexStrike call —
  verified by a test asserting the HexStrike client is never invoked when
  Scope Guard rejects.
- Localhost/private/link-local/cloud-metadata addresses are blocked by
  default; the check re-resolves the hostname at check time and inspects
  the **resolved address**, not the hostname string, specifically
  defending against DNS rebinding.
- A target must have a matching, non-revoked, unexpired, **verified**
  authorization at or under its authorized tier, within an allowed path
  prefix. Every branch fails closed.
- Only Tier 0/1 capabilities exist in code at all; Tier 2/3 are not
  implemented.

**Known gap**: the actual outbound HTTP client that executes a validated
request (inside HexStrike itself, not built by this adapter) must connect
to the exact address Scope Guard just checked, not re-resolve a second
time — documented as a hard requirement in `resolve-and-check.ts`, since
skipping it reopens the rebinding window between check and connect.

## 3. Secret leakage

**Threat**: a discovered secret (from Gitleaks, or embedded in repository
content) ends up in logs, the UI, or an AI prompt.

**Mitigations**:

- `packages/security-engine`'s Gitleaks normalizer masks `Secret`/`Match`
  via `maskSecretValue` before a `FindingDraft` is even constructed —
  tested by asserting the raw secret is absent from the serialized draft.
- `packages/ai-engine`'s `redactSecretsInText()` pattern-matches and masks
  secrets in any content before it's wrapped and sent to a model.
- `apps/api`'s structured logging (`nestjs-pino`) redacts `authorization`,
  `cookie`, `set-cookie`, and common secret-shaped fields at the
  transport layer.
- `packages/code-intelligence`'s git error handling scrubs any
  credential embedded in a clone URL from both the thrown error's message
  and git's own raw stderr (which independently echoes the URL).

## 4. Webhook forgery / replay

**Threat**: a forged or replayed GitHub webhook triggers a scan or action.

**Mitigations** (`packages/github`):

- `verifyWebhookSignature()` — constant-time HMAC-SHA256 verification of
  `X-Hub-Signature-256`.
- `isDuplicateDelivery()` — idempotent processing keyed on GitHub's
  per-delivery id, preventing a retried delivery from running twice.

## 5. Cross-tenant data access

**Threat**: one organization's data (repositories, findings, target
authorizations) is readable or writable by another.

**Mitigations**: the Prisma schema (`packages/database`) carries an
explicit `organizationId` on every tenant-owned row — even where it could
be derived transitively through a join — so an authorization check can be
enforced directly against the row being read/written.
`packages/auth`'s `canAccessOrganization()`/`assertOrganizationAccess()`
is the single choke point every tenant-scoped lookup must pass through,
framework-agnostic so it's identically reusable from a controller, a
guard, or a worker job. `apps/api`'s `GET /repositories/:id` demonstrates
it end to end: a cross-tenant request returns 404, not 403 — confirming a
resource _exists_ to an unauthorized caller is itself a leak — verified
by a regression test where a user who exists but has no membership in the
resource's organization never receives the row.

**Remaining gap**: only this one endpoint exercises the check today; the
rest of the planned tenant-scoped API surface (scans, findings, target
authorizations) doesn't exist yet, so those aren't IDOR-tested — tracked,
not hidden, in [implementation-plan.md](implementation-plan.md).

## 6. AI cost/availability

**Threat**: an unbounded AI integration runs up cost or becomes a hard
dependency for otherwise-working functionality.

**Mitigations**: `BudgetGuard` rejects a call whose estimated cost would
exceed a per-scan or monthly budget before the call is made; every
consumer of the AI engine treats a missing/failed provider as a
"deterministic analysis completed successfully" outcome, never a hard
failure (Section 43).

## Out of scope for this document

Infrastructure-level threats (cloud provider security, container
escape, supply-chain attacks on npm dependencies) are standard concerns
for any Node.js service and aren't specific to Sentinel's design; they're
addressed through routine dependency scanning (which Sentinel can run on
itself) rather than product-specific mitigations described here.
