import { describe, expect, it } from "vitest";
import {
  evaluateApiFindings,
  findAuthRequirementMismatches,
  findPotentialResourceAuthorizationSurfaces,
  findUndiscoveredDocumentedEndpoints,
  findUndocumentedEndpoints,
} from "./api-findings";
import type { ApiEndpoint, ApiInventoryEntry } from "../types";

function endpoint(overrides: Partial<ApiEndpoint> = {}): ApiEndpoint {
  return { method: "GET", path: "/users/{id}", parameters: [], ...overrides };
}

describe("findUndocumentedEndpoints", () => {
  it("flags an observed endpoint with no OpenAPI declaration", () => {
    const inventory: ApiInventoryEntry[] = [
      { method: "GET", path: "/secret", inOpenApi: false, observed: true },
    ];
    const findings = findUndocumentedEndpoints(inventory);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("SENTINEL-API-101");
  });

  it("does not flag a documented, observed endpoint", () => {
    const inventory: ApiInventoryEntry[] = [
      { method: "GET", path: "/users/{id}", inOpenApi: true, observed: true },
    ];
    expect(findUndocumentedEndpoints(inventory)).toHaveLength(0);
  });
});

describe("findUndiscoveredDocumentedEndpoints", () => {
  it("flags a documented endpoint that was never observed, at info severity", () => {
    const inventory: ApiInventoryEntry[] = [
      {
        method: "GET",
        path: "/users/{id}",
        inOpenApi: true,
        observed: false,
        openApiEndpoint: endpoint(),
      },
    ];
    const findings = findUndiscoveredDocumentedEndpoints(inventory);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("info");
  });

  it("does not flag an endpoint that was observed", () => {
    const inventory: ApiInventoryEntry[] = [
      { method: "GET", path: "/users/{id}", inOpenApi: true, observed: true },
    ];
    expect(findUndiscoveredDocumentedEndpoints(inventory)).toHaveLength(0);
  });
});

describe("findAuthRequirementMismatches", () => {
  it("flags an endpoint with an explicit empty security array when others require auth", () => {
    const inventory: ApiInventoryEntry[] = [
      {
        method: "GET",
        path: "/account",
        inOpenApi: true,
        observed: true,
        openApiEndpoint: endpoint({ path: "/account", security: ["bearerAuth"] }),
      },
      {
        method: "GET",
        path: "/export",
        inOpenApi: true,
        observed: true,
        openApiEndpoint: endpoint({ path: "/export", security: [] }),
      },
    ];
    const findings = findAuthRequirementMismatches(inventory);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe("/export");
  });

  it("does not flag anything when no endpoint in the document requires auth at all", () => {
    const inventory: ApiInventoryEntry[] = [
      {
        method: "GET",
        path: "/public",
        inOpenApi: true,
        observed: true,
        openApiEndpoint: endpoint({ path: "/public", security: [] }),
      },
    ];
    expect(findAuthRequirementMismatches(inventory)).toHaveLength(0);
  });

  it("does not flag an endpoint whose security is simply undeclared (not an explicit opt-out)", () => {
    const inventory: ApiInventoryEntry[] = [
      {
        method: "GET",
        path: "/a",
        inOpenApi: true,
        observed: true,
        openApiEndpoint: endpoint({ path: "/a", security: ["bearerAuth"] }),
      },
      {
        method: "GET",
        path: "/b",
        inOpenApi: true,
        observed: true,
        openApiEndpoint: endpoint({ path: "/b", security: undefined }),
      },
    ];
    expect(findAuthRequirementMismatches(inventory)).toHaveLength(0);
  });
});

describe("findPotentialResourceAuthorizationSurfaces", () => {
  it("flags a path parameter named like a resource identifier", () => {
    const inventory: ApiInventoryEntry[] = [
      {
        method: "GET",
        path: "/users/{id}",
        inOpenApi: true,
        observed: true,
        openApiEndpoint: endpoint({ parameters: [{ name: "id", in: "path", required: true }] }),
      },
    ];
    const findings = findPotentialResourceAuthorizationSurfaces(inventory);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("info");
  });

  it("does not flag a path parameter with a non-identifier name", () => {
    const inventory: ApiInventoryEntry[] = [
      {
        method: "GET",
        path: "/reports/{format}",
        inOpenApi: true,
        observed: true,
        openApiEndpoint: endpoint({
          path: "/reports/{format}",
          parameters: [{ name: "format", in: "path", required: true }],
        }),
      },
    ];
    expect(findPotentialResourceAuthorizationSurfaces(inventory)).toHaveLength(0);
  });

  it("does not flag an entry with no OpenAPI declaration at all", () => {
    const inventory: ApiInventoryEntry[] = [
      { method: "GET", path: "/users/{id}", inOpenApi: false, observed: true },
    ];
    expect(findPotentialResourceAuthorizationSurfaces(inventory)).toHaveLength(0);
  });
});

describe("evaluateApiFindings", () => {
  it("aggregates findings from every rule", () => {
    const inventory: ApiInventoryEntry[] = [
      { method: "GET", path: "/undocumented", inOpenApi: false, observed: true },
      {
        method: "GET",
        path: "/users/{id}",
        inOpenApi: true,
        observed: false,
        openApiEndpoint: endpoint({
          security: ["bearerAuth"],
          parameters: [{ name: "id", in: "path", required: true }],
        }),
      },
    ];
    const findings = evaluateApiFindings(inventory);
    const ruleIds = findings.map((f) => f.ruleId).sort();
    expect(ruleIds).toEqual(["SENTINEL-API-101", "SENTINEL-API-102", "SENTINEL-API-104"]);
  });
});
