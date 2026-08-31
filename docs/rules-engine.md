# Sentinel Rules Engine

The Rules Engine (`packages/rules-engine`) is Sentinel's first-party,
fully-offline static analysis engine. It requires **no AI API call** to
discover a finding — every rule is a deterministic function over an AST,
a lightweight call graph, and a data-flow (taint) analysis. AI, when
configured elsewhere in Sentinel, may explain or correlate a finding
afterward; it never discovers one on its own for these rules.

This is what lets Sentinel's positioning be more specific than "runs
Semgrep and shows the output": Sentinel traces `request → controller →
service → repository → database → response` and reasons about what
happened along the way — was the value validated, was it authorized,
did it reach a sink unsanitized.

## Why this exists, and what it does not claim

Integrating Semgrep/Gitleaks/OSV-Scanner is running someone else's tool
and normalizing its output. The Rules Engine is Sentinel's own analysis:
real AST parsing (via `ts-morph`, the TypeScript compiler API), an
interprocedural call graph resolved through the actual type checker (not
name-matching), a lightweight control-flow analysis, and a taint engine
that understands the difference between a value being _validated_ and a
value being _authorized_.

It is a **static approximation**. It cannot prove the absence of a
control implemented outside the files it analyzed (an API gateway, a
reverse proxy, a framework-level policy applied by convention it doesn't
recognize). Every finding says what was _observed_ and what was _not
observed_ — never "definitely exploitable" — and confidence is scored
and shown, not implied by severity alone.

## Architecture

```
Repository files
      │
      ▼
ts-morph Project (real TS/JS parsing)
      │
      ├── Route extraction (Express / NestJS / Next.js App Router + pages)
      │
      ├── Call graph resolution (TypeScript symbol resolution, not name matching)
      │
      ├── CFG guard-dominance (early-return / if-else reachability)
      │
      └── Taint engine (SOURCE → PROPAGATION → TRANSFORM → SINK)
              │
              ▼
      Authorization Analyzer (built on the taint engine, restricted to
      single-record database lookups)
              │
              ▼
        Rule Registry (8 rules, run against a shared RuleContext)
              │
              ▼
      RuleFinding[] → FindingDraft → existing correlation/scoring pipeline
```

Source: `packages/rules-engine/src/analysis/*` (the shared analysis
layer), `packages/rules-engine/src/rules/*` (the rules themselves, which
are thin — the analysis layer is where the engineering weight is),
`packages/rules-engine/src/engine/*` (registry, runner, config,
suppressions).

This package does **not** reuse `@sayan-sentinel/code-intelligence`'s
`CodeGraph` — that graph is a coarse node/edge model built for
visualization (file/function/route/db-model nodes; IMPORTS/CALLS/QUERIES
edges) and doesn't carry the per-statement, per-expression detail taint
tracking needs. The Rules Engine builds its own `ts-morph` `Project` the
same way `code-intelligence` does (same file-walking, same extension
filter) and analyzes it directly.

## The taint model

Concepts, matching the architecture this was designed against:

- **SOURCE** — untrusted input: `req.params`/`req.query`/`req.body`/
  `req.headers`/`req.cookies` (Express), `@Param()`/`@Query()`/`@Body()`/
  `@Headers()` (NestJS), destructured `params`/`searchParams` and
  `request.json()`/`cookies()`/`headers()` (Next.js).
  See `analysis/sources.ts`.
- **SINK** — a typed catalog: `database` (Prisma `find*`/`update`/
  `delete`), `raw_query` (`$queryRawUnsafe`, `$executeRawUnsafe`, a bare
  `connection.query`, `knex.raw`), `command_execution` (`exec`/
  `execSync`/`eval`), `filesystem` (`fs.readFile`/`writeFile`/...),
  `http_request` (`fetch`/`axios`/`http`/`https`), `html_output`
  (`dangerouslySetInnerHTML`), `redirect`, `logging`, `sensitive_response`
  (`res.json`/`res.send`). See `analysis/sinks.ts`.
- **TRANSFORM** — something that happens to the value on the way:
  `numeric_coercion` (`Number()`, `parseInt()`, unary `+`),
  `string_coercion`, `format_validation` (a Zod schema's `.parse()`/
  `.safeParse()`), `html_escape` (`DOMPurify.sanitize`, an
  `escapeHtml`-named call), `path_normalize` (`path.normalize`/
  `path.basename`). See `analysis/transforms.ts`.
- **AUTHORIZATION_GUARD** — a call whose name matches an
  authorization-decision pattern (`isOwner`, `assertOwnership`,
  `checkTenantAccess`, `can(...)`, `authorize(...)`, ...), deliberately
  excluding pure-authentication checks (`isAuthenticated`). This is
  tracked as a _flow-gating_ fact, separate from value transforms.

**The sanitizer-vs-validator distinction is enforced structurally, not by
convention.** Whether a transform clears taint is asked per sink
category (`neutralizesFor(transform, sinkCategory)` in
`transforms.ts`): `Number(id)` clears taint for `command_execution` and
`database` (a number can't carry shell/SQL syntax) but **never** clears
taint for authorization purposes — `format_validation` and
`path_normalize` never neutralize _anything_ in this model, because a
UUID-shaped string is still an arbitrary resource identifier and a
normalized path still isn't proven contained within a root.

## Call graph and interprocedural resolution

`analysis/symbols.ts` resolves a call's callee to its actual declaration
using the TypeScript type checker (`Node.getSymbol()` /
`Symbol.getDeclarations()`) — not string/name matching. This is what
lets the taint engine follow `this.accountService.getAccount(id)` to
`AccountService.getAccount`'s real method body. Resolution is
conservative: a call the checker can't bind unambiguously (dynamic
dispatch, a computed member expression) is left unresolved, not guessed.
The taint engine recurses into resolved callees up to a bounded depth
(4 hops) with a recursion guard against mutually-recursive functions and
an overall node-visit budget, so a large codebase can't cause runaway
analysis time.

## Control-flow (guard dominance)

`analysis/cfg.ts` is deliberately **not** a full CFG — it's exactly
enough to answer "does this condition gate reaching this node," handling
the two patterns that actually occur in Express/NestJS handlers:
direct nesting (`if (isOwner) { sink() }`) and the far more common
early-return guard (`if (!isOwner) return; sink()`).

## Authorization Analyzer (the flagship: SENTINEL-AUTHZ-001)

`analysis/authorization.ts` restricts the taint engine to single-record
database lookups (Prisma `findUnique`/`findFirst`/`update`/`delete`) and,
for each user-controlled identifier reaching one, evaluates independently:

1. **Ownership predicate in the query itself** — does the same `where`
   object also filter by a property that looks like ownership
   (`ownerId`/`userId`/`tenantId`/`organizationId`/...) whose value looks
   session-derived (`session.user.id`, `req.user.id`, ...)?
2. **A dominating authorization guard** — either before the query call,
   or — the "fetch first, then check, then return" pattern, which is
   legitimate when the authorization decision needs data from the row
   itself (e.g. checking `resource.tenantId` requires having read
   `resource`) — dominating the eventual `return`/response-sink call of
   the fetched value, still within the same function.
3. **Whether the result is observably returned to the client** — a
   textual-reference approximation (direct return, or a variable later
   returned/passed to a response sink), documented as not full alias
   analysis.
4. **Whether the model name looks security-sensitive** (`User`,
   `Account`, `Organization`, `Payment`, `Credential`, `Session`,
   `APIKey`, ...) — this only ever influences confidence, never creates a
   finding by itself.

A finding fires only when _neither_ signal (1) nor (2) is present _and_
(3) is true. This design was validated by running the engine against
the Sentinel repository itself and finding one real false positive
(`RepositoriesService.getRepositoryForUser`, which fetches then checks
organization membership before returning) — signal (2)'s "guard
dominates the return" case was added specifically because of that
finding, with a regression test (`authz-001.test.ts`) locking in the fix.
See [Self-scan results](#self-scan-results) below.

## Confidence model

`findings/confidence.ts` — additive scoring from a base of 35, clamped
to `[5, 95]`, mapped to a bucket: `>=75` high, `>=50` medium, else low.
**Never "confirmed"** — that level is reserved for dynamic validation.
Each rule documents its own signals inline (see each rule file's
`computeConfidence([...])` call) so the score is traceable to specific,
named evidence rather than an opaque number.

## Rule catalog (8 implemented)

| Rule ID              | Title                                                                    | Category      | Default severity |
| -------------------- | ------------------------------------------------------------------------ | ------------- | ---------------- |
| `SENTINEL-AUTHZ-001` | User-Controlled Resource Access Without Ownership Constraint (BOLA/IDOR) | authorization | high/medium      |
| `SENTINEL-AUTHZ-004` | Client-Supplied Privilege Decision                                       | authorization | high             |
| `SENTINEL-INJ-001`   | SQL / Raw Query Injection                                                | injection     | critical         |
| `SENTINEL-INJ-002`   | OS Command Injection                                                     | injection     | critical         |
| `SENTINEL-INJ-003`   | Cross-Site Scripting via `dangerouslySetInnerHTML`                       | injection     | high             |
| `SENTINEL-FS-001`    | Path Traversal                                                           | filesystem    | high             |
| `SENTINEL-SSRF-001`  | Server-Side Request Forgery                                              | ssrf          | high             |
| `SENTINEL-DATA-001`  | Sensitive Data Exposure via API Response                                 | data-exposure | high             |

Each rule's exact `description`/`cwe`/`owasp`/`remediation` is defined
in its source file and is what the Rule Registry and any future Rule
Explorer UI would read from — there is no separate hand-maintained
catalog to drift out of sync.

**Deferred, not implemented** (documented honestly rather than silently
dropped): `SENTINEL-AUTHZ-002` (authorization check after a _mutation_,
using CFG dominance the same way AUTHZ-001 does but for write
operations), `SENTINEL-AUTHZ-003` (tenant boundary missing from a
multi-tenant query), `SENTINEL-AUTHN-001/002/003`, `SENTINEL-API-001..004`,
`SENTINEL-DATA-002/003`, JWT/crypto/CORS/webhook rule families. The
architecture (taint engine, call graph, CFG, confidence engine) supports
adding these without redesign — see [Extending the rule set](#extending-the-rule-set).

## Framework coverage

- **Express** — `app.get/post/put/delete/patch(...)` route registration,
  handler resolved inline or via identifier reference; `req.params/query/
body/headers/cookies`.
- **NestJS** — `@Controller`/`@Get`/`@Post`/etc., `@Param`/`@Query`/
  `@Body`/`@Headers` decorated parameters, `@UseGuards` recorded as an
  observed guard (see the note on `@UseGuards` below).
- **Next.js App Router** — `route.ts` exported `GET`/`POST`/etc. handlers
  with normalized paths (`[id]` → `{id}`, `[...slug]` → `{slug}`, route
  groups `(group)` stripped); `page.tsx` default-exported Server
  Components registered as a `PAGE` pseudo-route so rules like INJ-003 can
  analyze `searchParams`/`params` reaching `dangerouslySetInnerHTML`.

**A note on `@UseGuards`:** it's recorded as an "observed guard" on the
route (shown in a finding's Authentication evidence line) but is **not**
by itself treated as clearing AUTHZ-001 — Sentinel cannot statically know
what an opaque `Guard` class actually checks, so it still requires an
in-body ownership predicate or a resolvable guard call. This is
intentionally conservative.

## CLI

```bash
sentinel scan .                                  # table output, exits 0/1/2
sentinel scan . --format json
sentinel scan . --format sarif
sentinel scan . --rule SENTINEL-AUTHZ-001
sentinel scan . --baseline sentinel-baseline.json
```

Exit codes: **0** — scan completed, no high/critical-severity finding
(policy passed). **1** — scan completed, at least one high/critical
finding (policy violation). **2** — the engine could not run at all (bad
path, uncaught exception). This mirrors standard linter exit-code
convention so it composes directly into CI.

## Suppressions

```ts
// sentinel-ignore SENTINEL-AUTHZ-001 -- reviewed, reason required here
const account = await prisma.account.findUnique({ where: { id } });
```

A reason is mandatory — `// sentinel-ignore RULE_ID` with no `-- reason`
suppresses nothing. Matches the same line or the line directly above the
finding; every suppression is counted in `RuleRunResult.suppressedCount`
so it's auditable, not silent.

## Configuration

```ts
import { defineSentinelConfig } from "@sayan-sentinel/rules-engine";

export default defineSentinelConfig({
  rules: {
    "SENTINEL-AUTHZ-001": { severity: "critical" },
    "SENTINEL-DATA-001": { enabled: false },
  },
});
```

## Correlation with the rest of Sentinel

Rules Engine findings map to the shared `FindingDraft` shape
(`findings/mapper.ts`) with `primarySource: "rules_engine"` — a value
distinct from `"static_analysis"` (Semgrep) added specifically so the
correlation engine (`packages/findings/src/correlation.ts`) can tell them
apart and escalate confidence when both a deterministic rule _and_ a
generic scanner independently flag the same code, rather than
deduplicating them as "the same detector." `RulesEngineScannerAdapter`
(`adapter/RulesEngineScannerAdapter.ts`) implements the same
`ScannerAdapter` interface Semgrep/Gitleaks/OSV-Scanner use and is wired
into `apps/worker`'s scan pipeline (`queue/scan-worker.ts`) as the first
scanner in the list — it is always "available" (in-process TypeScript,
no external binary), so its findings are present even in an environment
with none of the external tools installed.

## SARIF

`findings/sarif.ts` produces a SARIF 2.1.0 log with a real
`tool.driver.rules` array populated from the actual Rule Registry (not a
hand-written stub), so every `ruleId` a result references resolves to a
real name/description/help text.

## NO-AI mode

The Rules Engine has **zero** dependency on any AI package, model, or
API key — there is no code path in `packages/rules-engine` that touches
`@sayan-sentinel/ai-engine` or any network call. `SENTINEL_NO_AI=true`
has no effect on it because there is nothing to disable: repo ingestion,
route/AST/call-graph/data-flow analysis, all 8 rules, the CLI, SARIF
output, and its correlation-pipeline wiring all run identically with or
without AI configured.

## Self-scan results

Running `sentinel scan .` against this repository (excluding nothing —
including its own test fixtures) currently reports:

- 3 findings in `packages/rules-engine/src/testing/fixtures/authz-001/`
  — these are the package's own _intentionally_ vulnerable fixtures used
  by `authz-001.test.ts`; correctly flagged, not a defect.
- 1 finding in `examples/vulnerable-demo-app/src/app.js` (command
  injection) — the pre-existing, intentionally vulnerable demo fixture;
  correctly flagged.
- 0 findings anywhere else in the actual product code.

One real false positive was found and fixed during this process:
`RepositoriesService.getRepositoryForUser` (`apps/api/src/repositories/`)
fetches a repository unscoped, then checks organization membership
against the fetched row before returning it or `null`. The first version
of AUTHZ-001 only checked for a guard _preceding_ the query and flagged
this as unguarded. The Authorization Analyzer was extended to also
recognize a guard dominating the eventual return of the fetched value
within the same function — a legitimate, safe pattern the reference
material didn't originally describe — and a regression test was added
(`authz-001.test.ts`, "does not flag a service method that checks
organization membership after fetching..."). No detection was weakened
to make this pass; the fix adds a case the analyzer previously missed.

## Extending the rule set

```ts
import type { SentinelRule } from "@sayan-sentinel/rules-engine";

export const myRule: SentinelRule = {
  id: "CUSTOM-001",
  title: "...",
  description: "...",
  category: "authorization",
  severity: "medium",
  supportedLanguages: ["typescript", "javascript"],
  remediation: "...",
  analyze(context) {
    // context.routes, context.project, context.relativePath(sourceFile)
    return [];
  },
};
```

Register it with `new RuleRegistry().registerAll([...defaultRules, myRule])`
and pass that registry to `runRules(registry, context)` in place of
`RuleEngine`'s default. Custom rules operate against the same
`RuleContext` (parsed `ts-morph` project, extracted routes) — there is no
mechanism for a rule to execute arbitrary OS commands or reach outside
the analyzed source tree.

## Testing

33 tests across 9 files in `packages/rules-engine`, covering: true
positives and true negatives for every rule, three purpose-built
adversarial AUTHZ-001 fixtures (renamed variables through a format
validator, an interprocedural service-layer hop, a check-after-fetch
safe pattern), NestJS `@UseGuards` non-suppression, Next.js Route
Handler and page-component variants, suppression comment scoping and
mandatory-reason enforcement, and config severity overrides/rule
disabling. Run with `pnpm --filter @sayan-sentinel/rules-engine test`.

## Known limitations (stated plainly)

- **Intraprocedural-first, bounded interprocedural.** Call resolution
  requires the TypeScript checker to bind the callee statically; dynamic
  dispatch through an interface with multiple implementations is not
  resolved.
- **`reachesResponse` is textual-reference matching**, not full alias
  analysis — renaming a value through an unrelated wrapper function
  before it reaches the response can miss the connection (false-negative
  direction) or, for a value returned from a callee reached
  interprocedurally, assume the caller forwards it without re-confirming
  that forward path (false-positive-leaning direction; see the
  docstring on `reachesResponse` in `analysis/authorization.ts`).
- **ORM coverage is Prisma-only for V1.** TypeORM/Sequelize/Mongoose
  adapters are a follow-up, not silently pretended to work.
- **Authorization-guard recognition is name-pattern-based** (`isOwner`,
  `assertOwnership`, `can(...)`, ...) plus the structural ownership-
  predicate check — an authorization helper with an unrelated name that
  the analyzer can't recognize by name or structure will not be credited,
  which biases toward false positives rather than false negatives for
  unusual naming.
- **`@UseGuards`/NestJS Guards are not semantically evaluated** — an
  opaque Guard class's actual logic is never inspected, only its
  decorator's presence is recorded as supporting evidence.
- Sentinel performs a **static approximation** and cannot prove the
  absence of an authorization control implemented outside the analyzed
  files (an API gateway, a service mesh policy, a framework convention
  the engine doesn't recognize).
