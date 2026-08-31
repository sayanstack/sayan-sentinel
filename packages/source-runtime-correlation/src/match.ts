import { isParamSegment, splitPathSegments } from "./normalize";
import type { CorrelationResult, NormalizedRoute, RouteMatch } from "./types";

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Matches a normalized pattern (`/users/{id}`) against a concrete path
 * (`/users/123`), segment by segment. Both must have the same segment
 * count — a `{param}` matches exactly one segment, never a variable
 * number (see the catch-all limitation noted on `normalizeNextAppRouterPath`).
 * Literal segments are compared case-insensitively, matching how most HTTP
 * routers treat path casing. Returns the extracted parameter values keyed
 * by name, or `undefined` if the pattern doesn't match at all.
 */
export function matchPath(
  pattern: string,
  concretePath: string,
): Record<string, string> | undefined {
  const patternSegments = splitPathSegments(pattern);
  const concreteSegments = splitPathSegments(concretePath);
  if (patternSegments.length !== concreteSegments.length) return undefined;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i]!;
    const concreteSegment = concreteSegments[i]!;
    if (isParamSegment(patternSegment)) {
      params[patternSegment.slice(1, -1)] = safeDecodeURIComponent(concreteSegment);
    } else if (patternSegment.toLowerCase() !== concreteSegment.toLowerCase()) {
      return undefined;
    }
  }
  return params;
}

/** Count of literal (non-parameter) segments — more literal segments means a more specific, more confident match. */
function specificityOf(pattern: string): number {
  return splitPathSegments(pattern).filter((segment) => !isParamSegment(segment)).length;
}

/**
 * Finds every route whose method and pattern match a concrete request,
 * ranked most-specific first. A route registered as `/users/me` (fully
 * literal, specificity 2) outranks `/users/{id}` (specificity 1) for the
 * concrete path `/users/me` — the same precedence an HTTP router itself
 * would apply, since a literal route is always more specific than a
 * parameterized one covering the same shape.
 */
export function findMatchingRoutes(
  method: string,
  concretePath: string,
  routes: NormalizedRoute[],
): RouteMatch[] {
  const matches: RouteMatch[] = [];
  for (const route of routes) {
    if (route.method !== "*" && route.method.toUpperCase() !== method.toUpperCase()) continue;
    const params = matchPath(route.pattern, concretePath);
    if (!params) continue;
    matches.push({ route, params, specificity: specificityOf(route.pattern) });
  }
  return matches.sort((a, b) => b.specificity - a.specificity);
}

/**
 * The flagship operation: correlates one concrete runtime request (method
 * + path, e.g. `GET /users/123`) against a repository's normalized source
 * routes, returning the best match plus any other route tied with it at
 * the same specificity — a genuine ambiguity the caller should see rather
 * than have silently resolved by array order.
 */
export function correlateRuntimeRequest(
  method: string,
  concretePath: string,
  sourceRoutes: NormalizedRoute[],
): CorrelationResult {
  const matches = findMatchingRoutes(method, concretePath, sourceRoutes);
  const top = matches[0];
  if (!top) return { ambiguousWith: [] };

  const ambiguousWith = matches
    .slice(1)
    .filter((m) => m.specificity === top.specificity)
    .map((m) => m.route);

  return { match: top, ambiguousWith };
}
