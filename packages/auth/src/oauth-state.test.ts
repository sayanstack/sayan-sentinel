import { describe, expect, it } from "vitest";
import { createOAuthState, verifyOAuthState } from "./oauth-state";

const SECRET = "test-secret-value";

describe("createOAuthState / verifyOAuthState", () => {
  it("accepts a freshly created state", () => {
    const state = createOAuthState(SECRET);
    expect(verifyOAuthState(state, SECRET)).toBe(true);
  });

  it("rejects a state signed with a different secret", () => {
    const state = createOAuthState(SECRET);
    expect(verifyOAuthState(state, "wrong-secret")).toBe(false);
  });

  it("rejects a tampered nonce", () => {
    const state = createOAuthState(SECRET);
    const [, timestamp, signature] = state.split(".");
    expect(verifyOAuthState(`tampered.${timestamp}.${signature}`, SECRET)).toBe(false);
  });

  it("rejects an expired state", () => {
    const state = createOAuthState(SECRET);
    expect(verifyOAuthState(state, SECRET, -1)).toBe(false);
  });

  it("rejects a malformed state", () => {
    expect(verifyOAuthState("not-a-state", SECRET)).toBe(false);
    expect(verifyOAuthState("", SECRET)).toBe(false);
    expect(verifyOAuthState("a.b.c.d", SECRET)).toBe(false);
  });
});
