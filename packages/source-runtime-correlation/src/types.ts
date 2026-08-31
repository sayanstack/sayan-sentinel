export type RouteOrigin = "source" | "runtime" | "openapi";

export interface NormalizedRoute {
  /** "GET"/"POST"/etc, or "*" to match any method (rare — e.g. a catch-all handler). */
  method: string;
  /** Normalized path pattern using `{param}` placeholders, e.g. "/api/users/{id}". Always starts with "/". */
  pattern: string;
  origin: RouteOrigin;
  /**
   * Free-form provenance for evidence/display — e.g. `{ filePath, line,
   * framework }` for a source route, `{ observedAt }` for a runtime one.
   * Never interpreted by the matcher itself; this package only ever reasons
   * about `method` and `pattern`.
   */
  metadata?: Record<string, unknown>;
}

export interface RouteMatch {
  route: NormalizedRoute;
  /** Path parameter values extracted from the concrete path, keyed by the pattern's param name. */
  params: Record<string, string>;
  /** Higher = more specific (more literal, non-parameter segments). Used to rank multiple matching patterns. */
  specificity: number;
}

export interface CorrelationResult {
  /** The highest-specificity match, if any route matched at all. */
  match?: RouteMatch;
  /**
   * Other routes tied with `match` for the same top specificity — a
   * genuine structural ambiguity (e.g. two routes registered as
   * `/users/{id}` and `/users/{userId}` are indistinguishable by shape
   * alone) surfaced explicitly rather than silently resolved by array
   * order.
   */
  ambiguousWith: NormalizedRoute[];
}
