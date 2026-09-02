import * as crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./encryption";

const KEY = crypto.randomBytes(32).toString("base64");
const OTHER_KEY = crypto.randomBytes(32).toString("base64");

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext value", () => {
    const encrypted = encryptSecret("super-secret-token", KEY);
    expect(decryptSecret(encrypted, KEY)).toBe("super-secret-token");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-plaintext", KEY);
    const b = encryptSecret("same-plaintext", KEY);
    expect(a).not.toBe(b);
  });

  it("throws when decrypting with the wrong key", () => {
    const encrypted = encryptSecret("super-secret-token", KEY);
    expect(() => decryptSecret(encrypted, OTHER_KEY)).toThrow();
  });

  it("throws on a tampered ciphertext (GCM auth tag check)", () => {
    const encrypted = encryptSecret("super-secret-token", KEY);
    const [iv, authTag, ciphertext] = encrypted.split(".") as [string, string, string];
    const tamperedCiphertext = Buffer.from(ciphertext, "base64url");
    tamperedCiphertext[0] = (tamperedCiphertext[0] ?? 0) ^ 0xff;
    const tampered = `${iv}.${authTag}.${tamperedCiphertext.toString("base64url")}`;
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it("throws on a malformed encoded value", () => {
    expect(() => decryptSecret("not-encrypted", KEY)).toThrow();
  });

  it("rejects a key that isn't exactly 32 bytes", () => {
    const shortKey = Buffer.from("too-short").toString("base64");
    expect(() => encryptSecret("value", shortKey)).toThrow();
  });
});
