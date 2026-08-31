import { describe, expect, it } from "vitest";
import {
  isParamSegment,
  joinPathSegments,
  normalizeColonParams,
  normalizeNextAppRouterPath,
  splitPathSegments,
} from "./normalize";

describe("normalizeColonParams", () => {
  it("converts a single :param segment", () => {
    expect(normalizeColonParams("/users/:id")).toBe("/users/{id}");
  });

  it("converts multiple :param segments", () => {
    expect(normalizeColonParams("/orgs/:orgId/users/:userId")).toBe("/orgs/{orgId}/users/{userId}");
  });

  it("leaves a route with no params unchanged", () => {
    expect(normalizeColonParams("/health")).toBe("/health");
  });

  it("does not touch a literal segment that merely contains a colon-like pattern elsewhere", () => {
    expect(normalizeColonParams("/webhooks/stripe")).toBe("/webhooks/stripe");
  });
});

describe("normalizeNextAppRouterPath", () => {
  it("normalizes a dynamic segment", () => {
    expect(normalizeNextAppRouterPath("app/api/users/[id]/route.ts")).toBe("/api/users/{id}");
  });

  it("normalizes a catch-all segment to a single param", () => {
    expect(normalizeNextAppRouterPath("app/api/files/[...path]/route.ts")).toBe(
      "/api/files/{path}",
    );
  });

  it("strips route groups from the path", () => {
    expect(normalizeNextAppRouterPath("app/(dashboard)/api/settings/route.ts")).toBe(
      "/api/settings",
    );
  });

  it("returns undefined for a file that isn't a route handler", () => {
    expect(normalizeNextAppRouterPath("app/api/users/[id]/page.tsx")).toBeUndefined();
  });

  it("handles a nested route with multiple dynamic segments", () => {
    expect(normalizeNextAppRouterPath("app/api/orgs/[orgId]/users/[userId]/route.ts")).toBe(
      "/api/orgs/{orgId}/users/{userId}",
    );
  });
});

describe("splitPathSegments", () => {
  it("ignores a query string", () => {
    expect(splitPathSegments("/users/123?expand=profile")).toEqual(["users", "123"]);
  });

  it("ignores leading, trailing, and doubled slashes", () => {
    expect(splitPathSegments("//users//123/")).toEqual(["users", "123"]);
  });
});

describe("joinPathSegments", () => {
  it("joins segments with a single leading slash and no trailing slash", () => {
    expect(joinPathSegments("api", "users", "{id}")).toBe("/api/users/{id}");
  });

  it("returns the root path for no segments", () => {
    expect(joinPathSegments()).toBe("/");
  });

  it("drops empty segments", () => {
    expect(joinPathSegments("api", "", "users")).toBe("/api/users");
  });
});

describe("isParamSegment", () => {
  it("recognizes a {param} segment", () => {
    expect(isParamSegment("{id}")).toBe(true);
  });

  it("does not recognize a literal segment", () => {
    expect(isParamSegment("users")).toBe(false);
  });

  it("does not recognize an unbalanced brace", () => {
    expect(isParamSegment("{id")).toBe(false);
  });
});
