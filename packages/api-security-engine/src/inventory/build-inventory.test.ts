import { describe, expect, it } from "vitest";
import type { NormalizedRoute } from "@sayan-sentinel/source-runtime-correlation";
import { buildApiInventory } from "./build-inventory";
import type { ApiEndpoint } from "../types";

function endpoint(overrides: Partial<ApiEndpoint> = {}): ApiEndpoint {
  return { method: "GET", path: "/users/{id}", parameters: [], ...overrides };
}

function route(overrides: Partial<NormalizedRoute> = {}): NormalizedRoute {
  return { method: "GET", pattern: "/users/{id}", origin: "source", ...overrides };
}

describe("buildApiInventory", () => {
  it("marks an endpoint both documented and observed when it matches an observed route", () => {
    const inventory = buildApiInventory([endpoint()], [route()]);
    expect(inventory).toEqual([
      {
        method: "GET",
        path: "/users/{id}",
        inOpenApi: true,
        observed: true,
        openApiEndpoint: endpoint(),
      },
    ]);
  });

  it("marks a documented endpoint as unobserved when no route matches", () => {
    const inventory = buildApiInventory([endpoint()], []);
    expect(inventory[0]).toMatchObject({ inOpenApi: true, observed: false });
  });

  it("adds an observed route with no OpenAPI match as an undocumented entry", () => {
    const inventory = buildApiInventory([], [route({ pattern: "/widgets/{id}" })]);
    expect(inventory).toEqual([
      { method: "GET", path: "/widgets/{id}", inOpenApi: false, observed: true },
    ]);
  });

  it("does not double-count a route matched by more than one OpenAPI method entry", () => {
    const inventory = buildApiInventory(
      [endpoint({ method: "GET" }), endpoint({ method: "POST" })],
      [route({ method: "GET" })],
    );
    // The GET entry matches; the POST entry doesn't (method mismatch) --
    // the single observed route must not also appear as a separate
    // "undocumented" entry just because the POST declaration didn't match it.
    const undocumented = inventory.filter((e) => !e.inOpenApi);
    expect(undocumented).toHaveLength(0);
  });

  it("distinguishes routes by literal vs parameterized shape", () => {
    const inventory = buildApiInventory(
      [endpoint({ path: "/users/{id}" })],
      [route({ pattern: "/users/me" })],
    );
    expect(inventory).toEqual([
      {
        method: "GET",
        path: "/users/{id}",
        inOpenApi: true,
        observed: false,
        openApiEndpoint: endpoint(),
      },
      { method: "GET", path: "/users/me", inOpenApi: false, observed: true },
    ]);
  });
});
