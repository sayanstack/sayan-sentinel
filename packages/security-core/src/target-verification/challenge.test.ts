import { describe, expect, it } from "vitest";
import { generateVerificationChallenge } from "./challenge";

describe("generateVerificationChallenge", () => {
  it("generates a 48-character hex token", () => {
    const challenge = generateVerificationChallenge();
    expect(challenge).toMatch(/^[0-9a-f]{48}$/);
  });

  it("generates a different token on every call", () => {
    const a = generateVerificationChallenge();
    const b = generateVerificationChallenge();
    expect(a).not.toBe(b);
  });
});
