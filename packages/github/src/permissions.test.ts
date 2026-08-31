import { describe, expect, it } from "vitest";
import { GITHUB_APP_PERMISSIONS, GITHUB_APP_WEBHOOK_EVENTS } from "./permissions";

/**
 * A "permissions contract" test: this exists to make scope creep visible
 * in review, not to test business logic. If this test fails after an
 * intentional change, update the expectation *and* the justification
 * comments in permissions.ts in the same commit.
 */
describe("GITHUB_APP_PERMISSIONS", () => {
  it("requests exactly the documented, minimum-necessary scopes", () => {
    expect(GITHUB_APP_PERMISSIONS).toEqual({
      contents: "read",
      metadata: "read",
      pull_requests: "write",
      checks: "write",
      issues: "read",
    });
  });

  it("never requests write access to repository contents directly", () => {
    expect(GITHUB_APP_PERMISSIONS.contents).toBe("read");
  });

  it("never requests write access to issues", () => {
    expect(GITHUB_APP_PERMISSIONS.issues).toBe("read");
  });
});

describe("GITHUB_APP_WEBHOOK_EVENTS", () => {
  it("subscribes to exactly the documented events", () => {
    expect([...GITHUB_APP_WEBHOOK_EVENTS].sort()).toEqual(
      ["installation", "installation_repositories", "pull_request", "push"].sort(),
    );
  });
});
