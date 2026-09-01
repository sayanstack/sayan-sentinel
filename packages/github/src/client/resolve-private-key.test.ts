import { generateKeyPairSync } from "node:crypto";
import * as fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolvePrivateKey, validatePrivateKey } from "./resolve-private-key";

vi.mock("node:fs");

describe("resolvePrivateKey", () => {
  it("returns an inline key with real newlines unchanged", () => {
    const key = "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----";
    expect(resolvePrivateKey({ inline: key })).toBe(key);
  });

  it("un-escapes literal \\n sequences in a single-line pasted inline key", () => {
    const escaped = "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----";
    const result = resolvePrivateKey({ inline: escaped });
    expect(result).toBe("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----");
  });

  it("normalizes \\r\\n line endings to \\n", () => {
    const key = "-----BEGIN RSA PRIVATE KEY-----\r\nabc\r\n-----END RSA PRIVATE KEY-----";
    const result = resolvePrivateKey({ inline: key });
    expect(result).toBe("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----");
  });

  it("strips a wrapping quote character left over from copying out of another value", () => {
    const key = '"-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----"';
    const result = resolvePrivateKey({ inline: key });
    expect(result).toBe("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----");
  });

  it("trims stray leading/trailing whitespace from the paste", () => {
    const key = "\n  -----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----  \n";
    const result = resolvePrivateKey({ inline: key });
    expect(result).toBe("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----");
  });

  it("prefers the inline key over a path when both are given", () => {
    const result = resolvePrivateKey({ inline: "inline-key", path: "/some/path.pem" });
    expect(result).toBe("inline-key");
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it("reads the file at the given path when no inline key is given", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("file-contents");
    expect(resolvePrivateKey({ path: "/some/path.pem" })).toBe("file-contents");
  });

  it("returns null when the file can't be read", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(resolvePrivateKey({ path: "/missing.pem" })).toBeNull();
  });

  it("returns null when neither an inline key nor a path is given", () => {
    expect(resolvePrivateKey({})).toBeNull();
  });
});

describe("validatePrivateKey", () => {
  it("accepts a real, well-formed RSA private key", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
    });

    const result = validatePrivateKey(privateKey);

    expect(result.valid).toBe(true);
    expect(result.detail).toBe("OK");
  });

  it("rejects garbage with a real error message from the crypto module, not a generic one", () => {
    const result = validatePrivateKey("not a key at all");

    expect(result.valid).toBe(false);
    expect(result.detail.length).toBeGreaterThan(0);
  });

  it("never includes the key material itself in the shape summary", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    const bodyLine = privateKey.split("\n")[1] ?? "";

    const result = validatePrivateKey(privateKey);

    expect(result.shape).not.toContain(bodyLine);
    expect(result.shape).toContain("startsWithBegin=true");
  });
});
