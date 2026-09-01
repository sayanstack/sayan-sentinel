import * as fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolvePrivateKey } from "./resolve-private-key";

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
