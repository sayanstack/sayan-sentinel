import type { ConfidenceLevel, Severity } from "@sayan-sentinel/shared";
import type { ApiInventoryEntry } from "../types";

export interface ApiFinding {
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: ConfidenceLevel;
  reason: string;
  method: string;
  path: string;
}

const RESOURCE_ID_PARAM_NAME = /^(id|.*_id|.*Id|uuid)$/;

/**
 * SENTINEL-API-101: an endpoint observed in source or at runtime but not
 * declared anywhere in the imported OpenAPI document — an undocumented
 * endpoint is not inherently a vulnerability, but it's an attack-surface
 * gap the API's own documentation doesn't account for.
 */
export function findUndocumentedEndpoints(inventory: ApiInventoryEntry[]): ApiFinding[] {
  return inventory
    .filter((entry) => entry.observed && !entry.inOpenApi)
    .map((entry) => ({
      ruleId: "SENTINEL-API-101",
      title: "Undocumented Runtime Endpoint",
      description: `${entry.method} ${entry.path} was observed but is not declared in the imported OpenAPI document.`,
      severity: "low" as const,
      confidence: "high" as const,
      reason: `Detected: ${entry.method} ${entry.path} observed with no matching OpenAPI declaration.`,
      method: entry.method,
      path: entry.path,
    }));
}

/**
 * SENTINEL-API-102: an endpoint declared in the OpenAPI document but never
 * observed — could mean the documentation is stale, or that the endpoint
 * exists but wasn't reached during this analysis (a low/unauthenticated
 * crawl depth, or a route requiring specific request data to trigger).
 * Reported as `info`, since "not observed" during one bounded analysis
 * pass is far from proof the endpoint doesn't exist.
 */
export function findUndiscoveredDocumentedEndpoints(inventory: ApiInventoryEntry[]): ApiFinding[] {
  return inventory
    .filter((entry) => entry.inOpenApi && !entry.observed)
    .map((entry) => ({
      ruleId: "SENTINEL-API-102",
      title: "Documented Endpoint Not Observed",
      description: `${entry.method} ${entry.path} is declared in the OpenAPI document but was not observed in source or at runtime during this analysis.`,
      severity: "info" as const,
      confidence: "low" as const,
      reason: `Detected: ${entry.method} ${entry.path} declared in OpenAPI, no matching observation found.`,
      method: entry.method,
      path: entry.path,
    }));
}

/**
 * SENTINEL-API-103: an operation explicitly opts out of security
 * (`security: []`) in a document that otherwise defines security schemes
 * and requires them elsewhere — an inconsistency worth a human look, not
 * a claim that the endpoint is actually broken (the opt-out may be
 * entirely intentional, e.g. a health-check or login endpoint).
 */
export function findAuthRequirementMismatches(inventory: ApiInventoryEntry[]): ApiFinding[] {
  const findings: ApiFinding[] = [];
  const documented = inventory.filter((e) => e.openApiEndpoint);
  const anyRequireAuth = documented.some((e) => (e.openApiEndpoint?.security?.length ?? 0) > 0);
  if (!anyRequireAuth) return findings;

  for (const entry of documented) {
    const endpoint = entry.openApiEndpoint!;
    if (endpoint.security && endpoint.security.length === 0) {
      findings.push({
        ruleId: "SENTINEL-API-103",
        title: "Auth Requirement Mismatch",
        description: `${entry.method} ${entry.path} explicitly opts out of authentication (\`security: []\`) in a document where other endpoints require it — worth confirming this is intentional.`,
        severity: "low",
        confidence: "medium",
        reason: `Detected: ${entry.method} ${entry.path} declares an empty security requirement while other endpoints in the same document require authentication.`,
        method: entry.method,
        path: entry.path,
      });
    }
  }

  return findings;
}

/**
 * SENTINEL-API-104: a path parameter whose name looks like a resource
 * identifier (`id`, `userId`, `uuid`, ...) — informational only, meant to
 * be cross-referenced against `SENTINEL-AUTHZ-001` findings for the same
 * route from the Rules Engine, not a finding in its own right. A path
 * having an ID parameter is completely normal; this only flags where a
 * human reviewing authorization should look first.
 */
export function findPotentialResourceAuthorizationSurfaces(
  inventory: ApiInventoryEntry[],
): ApiFinding[] {
  const findings: ApiFinding[] = [];
  for (const entry of inventory) {
    const pathParams = entry.openApiEndpoint?.parameters.filter((p) => p.in === "path") ?? [];
    const resourceIdParams = pathParams.filter((p) => RESOURCE_ID_PARAM_NAME.test(p.name));
    if (resourceIdParams.length === 0) continue;

    findings.push({
      ruleId: "SENTINEL-API-104",
      title: "Potential Resource Authorization Surface",
      description: `${entry.method} ${entry.path} takes a resource-identifier-shaped path parameter (${resourceIdParams.map((p) => p.name).join(", ")}) — cross-reference with source-level authorization analysis for this route.`,
      severity: "info",
      confidence: "low",
      reason: `Detected: path parameter name(s) ${resourceIdParams.map((p) => p.name).join(", ")} match a resource-identifier naming pattern.`,
      method: entry.method,
      path: entry.path,
    });
  }
  return findings;
}

export function evaluateApiFindings(inventory: ApiInventoryEntry[]): ApiFinding[] {
  return [
    ...findUndocumentedEndpoints(inventory),
    ...findUndiscoveredDocumentedEndpoints(inventory),
    ...findAuthRequirementMismatches(inventory),
    ...findPotentialResourceAuthorizationSurfaces(inventory),
  ];
}
