# Security Model

This covers Sentinel's security posture as an application — see
[threat-model.md](threat-model.md) for the specific threats it defends
against, and [scope-guard.md](scope-guard.md) /
[ai-security.md](ai-security.md) for the two most safety-critical
subsystems in depth.

## The Sentinel Security Score

A transparent, deterministic 0–100 score
(`packages/findings/src/security-score.ts`), computed as:

```
score = max(0, 100 − Σ penalty(finding))

penalty(finding) = severityWeight × confidenceMultiplier
                    × ageMultiplier × validationMultiplier
```

- `severityWeight`: critical 20, high 10, medium 5, low 2, info 0.5 —
  deliberately steep at the top so a handful of criticals visibly
  dominate the score rather than being smoothed out by many low-severity
  findings.
- `confidenceMultiplier`: confirmed 1.0, high 0.85, medium 0.6, low 0.35 —
  a lower-confidence finding (more likely a false positive) penalizes
  less.
- `ageMultiplier`: ramps from 1.0 to 1.5× over 30 days an open finding
  stays open — rewards fixing things quickly, not just having few
  findings today.
- `validationMultiplier`: 1.2× for a finding a dynamic validation actually
  confirmed exploitable, vs. an equivalent unverified static finding.

Only open findings (`open`/`confirmed`/`likely`/`needs_review`) count;
`resolved`/`false_positive`/`accepted_risk` never do. This is **Sentinel's
own metric** — it is not presented as an industry-standard score (not
CVSS-equivalent), and the formula lives in the function's own doc comment
so it can't drift from what's documented elsewhere.

## Finding correlation

`correlateFindings()` groups drafts from potentially different detectors
(static analysis, secrets, dependencies, AI review, dynamic validation)
describing the same underlying issue into one `CorrelatedFinding`, instead
of one Finding per detector. Matching is a documented, deliberately simple
heuristic (same file + near/overlapping line range, or same category +
symbol for non-file-anchored findings like dependency advisories) — not a
claim of semantic understanding it doesn't have. When 2+ _distinct_
detectors agree, confidence escalates one level (capped at "confirmed"),
which is real signal: independent agreement is evidence.

## Tenant isolation

Every tenant-owned row in the Prisma schema
(`packages/database/prisma/schema.prisma`) carries an explicit
`organizationId`, even where it could be derived transitively through a
join — so an authorization check can be written directly against the row
in question. No API endpoints querying this data exist yet (see
[implementation-plan.md](implementation-plan.md)), so there is nothing to
IDOR-test yet; this is a disclosed gap, not a completed control.

## Secure defaults

- `LOCAL_LAB_MODE` defaults to requiring explicit opt-in and only ever
  affects Scope Guard's private-address block — never authorization,
  tier, or path checks.
- AI is off by default (`AI_PROVIDER=none`); every consumer treats a
  missing provider as "deterministic analysis completed successfully,"
  never a hard failure.
- Dynamic validation is off by default (`DYNAMIC_VALIDATION_ENABLED=false`); Tier 2/3
  dynamic-validation capabilities are not implemented in code at all, not
  merely disabled by configuration.
- Structured logging (`apps/api`) redacts auth headers, cookies, and
  common secret-shaped fields at the transport layer, not by convention.

## Reporting a vulnerability in Sentinel itself

See [SECURITY.md](../SECURITY.md).
