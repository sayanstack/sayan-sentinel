import { describe, expect, it } from "vitest";
import { maskSecretValue, redactCredentialsFromUrl, redactSensitiveKeys } from "./redact";

describe("redactCredentialsFromUrl", () => {
  it("strips a GitHub App installation token embedded in a clone URL", () => {
    const url = "https://x-access-token:ghs_secretvalue123@github.com/acme/widgets.git";
    expect(redactCredentialsFromUrl(url)).toBe("https://github.com/acme/widgets.git");
  });

  it("leaves a URL with no credentials unchanged", () => {
    const url = "https://github.com/acme/widgets.git";
    expect(redactCredentialsFromUrl(url)).toBe(url);
  });

  it("falls back to textual stripping for unparseable input rather than returning it verbatim", () => {
    // Invalid port makes this unparseable by the WHATWG URL constructor,
    // while still containing a "//user:pass@" credential pattern.
    const malformed = "https://user:pass@host:not-a-port/path";
    const result = redactCredentialsFromUrl(malformed);
    expect(result).not.toContain("user:pass@");
    expect(result).toContain("[redacted]@host");
  });
});

describe("redactSensitiveKeys", () => {
  it("redacts top-level secret-shaped keys", () => {
    const input = { username: "alice", password: "hunter2", apiKey: "sk-live-abc" };
    expect(redactSensitiveKeys(input)).toEqual({
      username: "alice",
      password: "[redacted]",
      apiKey: "[redacted]",
    });
  });

  it("redacts nested secret-shaped keys", () => {
    const input = { config: { githubAppPrivateKey: "-----BEGIN KEY-----" }, ok: true };
    expect(redactSensitiveKeys(input)).toEqual({
      config: { githubAppPrivateKey: "[redacted]" },
      ok: true,
    });
  });

  it("redacts secret-shaped keys inside arrays", () => {
    const input = [{ token: "abc" }, { token: "def" }];
    expect(redactSensitiveKeys(input)).toEqual([{ token: "[redacted]" }, { token: "[redacted]" }]);
  });

  it("handles circular references without infinite recursion", () => {
    const input: Record<string, unknown> = { name: "self-referential" };
    input.self = input;
    expect(() => redactSensitiveKeys(input)).not.toThrow();
  });

  it("passes through primitives untouched", () => {
    expect(redactSensitiveKeys("plain string")).toBe("plain string");
    expect(redactSensitiveKeys(42)).toBe(42);
    expect(redactSensitiveKeys(null)).toBe(null);
  });
});

describe("maskSecretValue", () => {
  it("never includes the full secret in its output", () => {
    const secret = "AKIAIOSFODNN7EXAMPLE";
    const masked = maskSecretValue(secret);
    expect(masked).not.toContain(secret);
    expect(masked).not.toBe(secret);
  });

  it("fully redacts short secrets rather than partially revealing them", () => {
    expect(maskSecretValue("abc123")).toBe("[redacted]");
  });

  it("keeps a small prefix/suffix for longer secrets to aid identification, masking the middle", () => {
    const masked = maskSecretValue("AKIAIOSFODNN7EXAMPLE");
    expect(masked.startsWith("AKI")).toBe(true);
    expect(masked.endsWith("PLE")).toBe(true);
    expect(masked).toContain("*");
  });

  it("is deterministic for the same input", () => {
    expect(maskSecretValue("some-long-secret-value-here")).toBe(
      maskSecretValue("some-long-secret-value-here"),
    );
  });
});
