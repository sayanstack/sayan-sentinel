# Source-to-Runtime Correlation

`packages/source-runtime-correlation` is the flagship piece the
Source-to-Runtime specification names explicitly: mapping a source-code
route (`@Get(":id")` under `@Controller("accounts")`, `router.get("/users/:id", ...)`,
`app/api/users/[id]/route.ts`) to a concrete runtime request
(`GET /users/123`), so a finding discovered statically and one observed
at runtime can be recognized as the same endpoint.

## Design

The package is deliberately dependency-free at runtime — it reasons only
about two primitives:

```ts
interface NormalizedRoute {
  method: string; // "GET"/"POST"/etc, or "*"
  pattern: string; // "/api/users/{id}" — always "{param}" form
  origin: "source" | "runtime" | "openapi";
  metadata?: Record<string, unknown>; // free-form provenance, never interpreted by the matcher
}
```

Any caller — the Rules Engine's route extractor, a future runtime
endpoint inventory, an OpenAPI importer — constructs `NormalizedRoute[]`
from its own data and hands it to this package. This keeps the matching
logic (the actual hard, valuable part) independent of how routes were
discovered.

### Normalization (`normalize.ts`)

- `normalizeColonParams` — Express/NestJS `:param` → `{param}`. Both
  frameworks use identical param syntax, so one function covers both
  rather than two near-duplicate implementations.
- `normalizeNextAppRouterPath` — `app/api/users/[id]/route.ts` →
  `/api/users/{id}`, stripping route groups (`(group)`) and collapsing
  catch-all segments (`[...slug]`) to a single `{slug}` param. This
  mirrors the equivalent function in `@sayan-sentinel/rules-engine`'s
  route extractor — duplicated deliberately (a few lines of string
  logic) rather than imported, so this package has no dependency on the
  AST-parsing machinery that produces the file path in the first place.

### Matching (`match.ts`)

`matchPath(pattern, concretePath)` compares segment-by-segment: same
segment count required, a `{param}` segment matches exactly one concrete
segment (documented limitation — a catch-all route can't currently match
a multi-segment runtime path), literal segments compared
case-insensitively. `findMatchingRoutes` filters by HTTP method and
ranks results by **specificity** (count of literal segments) so
`/users/me` correctly outranks `/users/{id}` for the concrete path
`/users/me` — the same precedence an HTTP router itself applies.

`correlateRuntimeRequest(method, path, sourceRoutes)` is the actual
flagship operation: returns the best match plus `ambiguousWith` — any
other source route tied at the same specificity, a genuine structural
ambiguity (e.g. `/users/{id}` and `/users/{userId}` registered as
separate routes are indistinguishable by shape alone) surfaced
explicitly rather than silently resolved by array order.

## Proven, not just asserted

`integration.rules-engine.test.ts` loads real TypeScript source through
`@sayan-sentinel/rules-engine`'s actual `ts-morph`-based route extractor
(Express, NestJS, and Next.js App Router fixtures), converts the
extracted `RouteHandler[]` to `NormalizedRoute[]`, and correlates a
runtime path against it — proving the two packages' route
representations are compatible end-to-end, not just structurally similar
on paper. (This is a test-only dependency: `@sayan-sentinel/rules-engine`
is a devDependency here, not a production one — the package stays
runtime-independent.)

## What's NOT here

This package has no `RepositoryDeployment` entity, no persistence, no
runtime-endpoint discovery of its own (it consumes whatever
`NormalizedRoute[]` a caller supplies — pairing it with a real runtime
inventory requires `packages/web-security-engine`'s (not-yet-built)
discovery/crawler component or an OpenAPI import), and no wiring into a
Full Stack Scan workflow, the Application Graph, or the dashboard. It is
the matching _engine_ the Source-to-Runtime Correlation feature needs,
proven against real source-side data — the runtime-side inventory and
the job-pipeline orchestration that would call this in production remain
unbuilt.

## Testing

37 tests across 3 files: `normalize.test.ts` (17), `match.test.ts` (16 —
including the specificity-ranking and ambiguity-surfacing cases), and
the real cross-package integration test (4) described above.
