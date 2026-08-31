# API Security Engine

`packages/api-security-engine` builds an API endpoint inventory from an
OpenAPI document and cross-references it against observed endpoints
(source routes or runtime-discovered ones), producing the
`SENTINEL-API-1xx` finding family.

## OpenAPI import (`openapi/import.ts`)

`parseOpenApiDocument(content, "json" | "yaml")` parses (never fetches or
resolves remote `$ref`s) an OpenAPI/Swagger document. YAML support uses
the `yaml` package — the one dependency in this pass that isn't
"dependency-free by design," because parsing a well-defined interchange
format is a normal engineering task, not part of the trust boundary the
project keeps dependency-free elsewhere (IP/URL parsing, HTML
extraction).

`extractEndpointsFromOpenApi(document)` reads only the subset of
structure the rules below need: `paths`, per-operation `security`, and
`parameters`. An operation's `security: []` (explicit opt-out) is
preserved distinctly from an operation with no `security` key at all
(which inherits the document-level default) — that distinction is what
`SENTINEL-API-103` depends on.

## Inventory (`inventory/build-inventory.ts`)

`buildApiInventory(openApiEndpoints, observedRoutes)` merges the two
sides into one list, each entry marked `inOpenApi`/`observed`
independently. It reuses `@sayan-sentinel/source-runtime-correlation`'s
specificity-ranked matcher rather than a second pattern-matching
implementation: an OpenAPI path's `{param}` placeholders are substituted
with a synthetic literal segment, turning the pattern into a "concrete
path" the existing matcher can compare against other patterns — so "does
this OpenAPI path correspond to this observed route" is answered exactly
the same way "does this runtime request correspond to this source route"
already is.

`observedRoutes` is any `NormalizedRoute[]` — the same type
`@sayan-sentinel/rules-engine`'s route extractor and a runtime crawl
would both produce, so either (or both) can feed this without new
integration code.

## Rules

| Rule ID            | Title                                    | Severity | What it means                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SENTINEL-API-101` | Undocumented Runtime Endpoint            | low      | Observed but not in the OpenAPI document — an attack-surface gap the documentation doesn't account for, not inherently a vulnerability.                                                                                                                                                                                          |
| `SENTINEL-API-102` | Documented Endpoint Not Observed         | info     | In the OpenAPI document but never observed — could be stale docs or simply not reached during this analysis pass; `info` because "not observed once" is far from proof it doesn't exist.                                                                                                                                         |
| `SENTINEL-API-103` | Auth Requirement Mismatch                | low      | An operation declares `security: []` in a document where other operations require auth — an inconsistency worth a human look, not a claim the endpoint is broken (a login/health-check endpoint legitimately opts out). Only fires when the document demonstrably uses auth elsewhere, to avoid noise on an entirely-public API. |
| `SENTINEL-API-104` | Potential Resource Authorization Surface | info     | A path parameter named like a resource identifier (`id`, `userId`, `uuid`) — purely informational, meant to be cross-referenced against the Rules Engine's `SENTINEL-AUTHZ-001` findings for the same route, not a finding on its own.                                                                                           |

Severity discipline matches the platform-wide rule: nothing here claims
certainty. `SENTINEL-API-102`/`104` are explicitly `info`-only.

## What's NOT here

No GraphQL introspection, no request/response schema validation, no
"safety tier" scan-plan generation from the inventory (the spec's
"build scan plan by safety tier" from an OpenAPI import), no
authenticated-scan support, and no wiring into the worker's job pipeline
or dashboard — nothing calls this package from a real scan yet.
Correlating `SENTINEL-API-104`'s informational flags with actual
`SENTINEL-AUTHZ-001` findings from the Rules Engine (the cross-reference
the rule's own description mentions) is not automated — a human (or a
future correlation step) has to do it.

## Testing

23 tests across 3 files: OpenAPI parsing (valid JSON/YAML, malformed
input, security inheritance vs. explicit opt-out), inventory building
(matching, non-matching, method-mismatch, literal-vs-parameterized
shape), and all four rules (true positives, true negatives, the
"don't flag anything on an entirely-public API" case for API-103).
