import { describe, expect, it } from "vitest";
import { correlateRuntimeRequest, findMatchingRoutes, matchPath } from "./match";
import type { NormalizedRoute } from "./types";

function route(overrides: Partial<NormalizedRoute> = {}): NormalizedRoute {
  return { method: "GET", pattern: "/users/{id}", origin: "source", ...overrides };
}

describe("matchPath", () => {
  it("matches a concrete path against a parameterized pattern and extracts the param", () => {
    expect(matchPath("/users/{id}", "/users/123")).toEqual({ id: "123" });
  });

  it("matches a fully literal pattern with no params", () => {
    expect(matchPath("/health", "/health")).toEqual({});
  });

  it("does not match a different literal segment", () => {
    expect(matchPath("/users/{id}", "/accounts/123")).toBeUndefined();
  });

  it("does not match a different segment count", () => {
    expect(matchPath("/users/{id}", "/users/123/posts")).toBeUndefined();
  });

  it("extracts multiple params in order", () => {
    expect(matchPath("/orgs/{orgId}/users/{userId}", "/orgs/acme/users/42")).toEqual({
      orgId: "acme",
      userId: "42",
    });
  });

  it("matches literal segments case-insensitively", () => {
    expect(matchPath("/Users/{id}", "/users/123")).toEqual({ id: "123" });
  });

  it("URL-decodes an extracted param value", () => {
    expect(matchPath("/search/{term}", "/search/hello%20world")).toEqual({ term: "hello world" });
  });

  it("does not throw on a malformed percent-encoding in a param segment", () => {
    expect(matchPath("/search/{term}", "/search/100%")).toEqual({ term: "100%" });
  });
});

describe("findMatchingRoutes", () => {
  it("filters by HTTP method", () => {
    const routes = [route({ method: "GET" }), route({ method: "POST" })];
    const matches = findMatchingRoutes("POST", "/users/123", routes);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.route.method).toBe("POST");
  });

  it("matches a wildcard-method route regardless of the request method", () => {
    const routes = [route({ method: "*" })];
    expect(findMatchingRoutes("DELETE", "/users/123", routes)).toHaveLength(1);
  });

  it("ranks a literal route above a parameterized route covering the same path", () => {
    const routes = [route({ pattern: "/users/{id}" }), route({ pattern: "/users/me" })];
    const matches = findMatchingRoutes("GET", "/users/me", routes);
    expect(matches).toHaveLength(2);
    expect(matches[0]?.route.pattern).toBe("/users/me");
  });

  it("returns no matches for a path that matches nothing", () => {
    expect(findMatchingRoutes("GET", "/nonexistent", [route()])).toHaveLength(0);
  });
});

describe("correlateRuntimeRequest", () => {
  it("correlates a runtime request to its source route with extracted params", () => {
    const sourceRoutes = [
      route({
        pattern: "/api/users/{id}",
        metadata: { filePath: "users.controller.ts", line: 12 },
      }),
    ];
    const result = correlateRuntimeRequest("GET", "/api/users/42", sourceRoutes);
    expect(result.match?.route.metadata).toEqual({ filePath: "users.controller.ts", line: 12 });
    expect(result.match?.params).toEqual({ id: "42" });
    expect(result.ambiguousWith).toHaveLength(0);
  });

  it("reports no match when nothing correlates", () => {
    const result = correlateRuntimeRequest("GET", "/unknown", [route()]);
    expect(result.match).toBeUndefined();
  });

  it("surfaces a genuine ambiguity when two routes tie at the same specificity", () => {
    const sourceRoutes = [
      route({ pattern: "/users/{id}", metadata: { source: "a" } }),
      route({ pattern: "/users/{userId}", metadata: { source: "b" } }),
    ];
    const result = correlateRuntimeRequest("GET", "/users/42", sourceRoutes);
    expect(result.match).toBeDefined();
    expect(result.ambiguousWith).toHaveLength(1);
  });

  it("does not report ambiguity when one match is strictly more specific", () => {
    const sourceRoutes = [route({ pattern: "/users/{id}" }), route({ pattern: "/users/me" })];
    const result = correlateRuntimeRequest("GET", "/users/me", sourceRoutes);
    expect(result.match?.route.pattern).toBe("/users/me");
    expect(result.ambiguousWith).toHaveLength(0);
  });
});
