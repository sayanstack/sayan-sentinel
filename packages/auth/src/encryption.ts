import * as crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function loadKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `Encryption key must decode to exactly 32 bytes (got ${key.length}) — generate one with "openssl rand -base64 32"`,
    );
  }
  return key;
}

/**
 * AES-256-GCM at-rest encryption for third-party credentials Sentinel must
 * hold onto between requests (e.g. a HackerOne API token, so scope can be
 * re-synced later without asking the user to paste it in again) — never
 * used for session tokens, which stay stateless and unencrypted-but-signed
 * (see session.ts). Format: `<iv>.<authTag>.<ciphertext>`, each base64url.
 */
export function encryptSecret(plaintext: string, keyBase64: string): string {
  const key = loadKey(keyBase64);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64url")).join(".");
}

/**
 * Throws on a wrong key, tampered ciphertext, or malformed input — GCM's
 * auth tag makes this a real integrity check, not just decryption.
 */
export function decryptSecret(encoded: string, keyBase64: string): string {
  const key = loadKey(keyBase64);
  const parts = encoded.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted value");
  const [ivB64, authTagB64, ciphertextB64] = parts as [string, string, string];

  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(authTagB64, "base64url");
  const ciphertext = Buffer.from(ciphertextB64, "base64url");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
