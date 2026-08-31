import { describe, expect, it } from "vitest";
import {
  assertOrganizationAccess,
  canAccessOrganization,
  TenantAccessDeniedError,
} from "./tenant-access";

const memberships = [
  { userId: "user-alice", organizationId: "org-acme" },
  { userId: "user-alice", organizationId: "org-globex" },
  { userId: "user-bob", organizationId: "org-globex" },
];

describe("canAccessOrganization", () => {
  it("allows a user to access an organization they're a member of", () => {
    expect(canAccessOrganization("user-alice", "org-acme", memberships)).toBe(true);
  });

  it("allows a user with multiple memberships to access each of them", () => {
    expect(canAccessOrganization("user-alice", "org-globex", memberships)).toBe(true);
  });

  it("denies a user access to an organization they are not a member of (IDOR regression)", () => {
    // user-bob is only a member of org-globex — must not be able to
    // reach org-acme's resources by guessing/enumerating an id.
    expect(canAccessOrganization("user-bob", "org-acme", memberships)).toBe(false);
  });

  it("denies access for an unknown user id", () => {
    expect(canAccessOrganization("user-mallory", "org-acme", memberships)).toBe(false);
  });

  it("denies access when memberships is empty", () => {
    expect(canAccessOrganization("user-alice", "org-acme", [])).toBe(false);
  });
});

describe("assertOrganizationAccess", () => {
  it("does not throw for a valid membership", () => {
    expect(() => assertOrganizationAccess("user-alice", "org-acme", memberships)).not.toThrow();
  });

  it("throws TenantAccessDeniedError for a cross-tenant access attempt", () => {
    expect(() => assertOrganizationAccess("user-bob", "org-acme", memberships)).toThrow(
      TenantAccessDeniedError,
    );
  });

  it("the thrown error carries the userId and organizationId for audit logging", () => {
    try {
      assertOrganizationAccess("user-bob", "org-acme", memberships);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TenantAccessDeniedError);
      const denied = error as TenantAccessDeniedError;
      expect(denied.userId).toBe("user-bob");
      expect(denied.organizationId).toBe("org-acme");
    }
  });
});
