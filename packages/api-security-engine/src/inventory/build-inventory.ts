import {
  findMatchingRoutes,
  type NormalizedRoute,
} from "@sayan-sentinel/source-runtime-correlation";
import type { ApiEndpoint, ApiInventoryEntry } from "../types";

/**
 * Merges an OpenAPI-declared endpoint list with an observed endpoint list
 * (source routes from `@sayan-sentinel/rules-engine`, or runtime endpoints
 * from a `BoundedCrawler` run, converted to `NormalizedRoute[]` by the
 * caller) into one inventory — every endpoint that's declared, observed,
 * or both, with which is which recorded explicitly. Reuses
 * `source-runtime-correlation`'s specificity-ranked matcher rather than a
 * second matching implementation, so "does this OpenAPI path correspond to
 * this observed route" is answered the same way "does this runtime request
 * correspond to this source route" is.
 */
export function buildApiInventory(
  openApiEndpoints: ApiEndpoint[],
  observedRoutes: NormalizedRoute[],
): ApiInventoryEntry[] {
  const entries: ApiInventoryEntry[] = [];
  const matchedObserved = new Set<NormalizedRoute>();

  for (const endpoint of openApiEndpoints) {
    const matches = findMatchingRoutes(
      endpoint.method,
      patternToExamplePath(endpoint.path),
      observedRoutes,
    );
    for (const match of matches) matchedObserved.add(match.route);

    entries.push({
      method: endpoint.method,
      path: endpoint.path,
      inOpenApi: true,
      observed: matches.length > 0,
      openApiEndpoint: endpoint,
    });
  }

  for (const route of observedRoutes) {
    if (matchedObserved.has(route)) continue;
    entries.push({ method: route.method, path: route.pattern, inOpenApi: false, observed: true });
  }

  return entries;
}

/**
 * `findMatchingRoutes` compares a *concrete* path against a pattern, not
 * pattern-against-pattern — since every `{param}` segment matches exactly
 * one concrete segment, substituting a harmless placeholder token for each
 * `{param}` in the OpenAPI path produces a synthetic concrete path that
 * matches if and only if the two patterns have the same shape (segment
 * count and literal-vs-param structure), which is exactly the comparison
 * this inventory needs.
 */
function patternToExamplePath(pattern: string): string {
  return pattern.replace(/\{[^{}]+\}/g, "x");
}
