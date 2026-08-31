import { describe, expect, it } from "vitest";
import { redactSecretsInText } from "./redact-secrets-in-text";

describe("redactSecretsInText", () => {
  it("redacts an AWS access key and reports the label", () => {
    const { redacted, foundLabels } = redactSecretsInText('const key = "AKIAIOSFODNN7EXAMPLE";');
    expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(foundLabels).toContain("aws-access-key");
  });

  it("redacts a multiline private key block entirely", () => {
    const text = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEAdummy1234567890",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const { redacted, foundLabels } = redactSecretsInText(text);
    expect(redacted).not.toContain("MIIEowIBAAKCAQEAdummy1234567890");
    expect(foundLabels).toContain("private-key-block");
  });

  it("redacts a GitHub personal access token", () => {
    const { redacted, foundLabels } = redactSecretsInText(
      "token=ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    );
    expect(redacted).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(foundLabels).toContain("github-token");
  });

  it("redacts a JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const { redacted, foundLabels } = redactSecretsInText(`Authorization: Bearer ${jwt}`);
    expect(redacted).not.toContain(jwt);
    expect(foundLabels).toContain("jwt");
  });

  it("redacts a generic key=value secret while preserving the key name", () => {
    const { redacted, foundLabels } = redactSecretsInText('api_key: "sup3rSecretValue123"');
    expect(redacted).not.toContain("sup3rSecretValue123");
    expect(redacted).toContain('api_key="[redacted]"');
    expect(foundLabels).toContain("generic-key-value-secret");
  });

  it("leaves ordinary code with no secrets completely unchanged", () => {
    const code = "function add(a, b) { return a + b; }";
    const { redacted, foundLabels } = redactSecretsInText(code);
    expect(redacted).toBe(code);
    expect(foundLabels).toEqual([]);
  });

  it("redacts multiple distinct secret types present in the same text", () => {
    const text = [
      'aws_key = "AKIAIOSFODNN7EXAMPLE"',
      'github_token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"',
    ].join("\n");
    const { redacted, foundLabels } = redactSecretsInText(text);
    expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(redacted).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(foundLabels.sort()).toEqual(["aws-access-key", "github-token"]);
  });
});
