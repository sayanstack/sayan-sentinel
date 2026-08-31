import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./verify-signature";

const secret = "test-webhook-secret";
const payload = JSON.stringify({ action: "opened", number: 42 });

function sign(body: string, key: string): string {
  return `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed payload", () => {
    expect(verifyWebhookSignature(payload, sign(payload, secret), secret)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    expect(verifyWebhookSignature(payload, sign(payload, "wrong-secret"), secret)).toBe(false);
  });

  it("rejects a tampered payload signed for the original body", () => {
    const validSignature = sign(payload, secret);
    const tamperedPayload = JSON.stringify({ action: "opened", number: 999 });
    expect(verifyWebhookSignature(tamperedPayload, validSignature, secret)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature(payload, undefined, secret)).toBe(false);
    expect(verifyWebhookSignature(payload, null, secret)).toBe(false);
    expect(verifyWebhookSignature(payload, "", secret)).toBe(false);
  });

  it("rejects a malformed signature header without throwing", () => {
    expect(() => verifyWebhookSignature(payload, "not-a-real-signature", secret)).not.toThrow();
    expect(verifyWebhookSignature(payload, "not-a-real-signature", secret)).toBe(false);
  });

  it("rejects a signature of a completely different length without throwing", () => {
    expect(() => verifyWebhookSignature(payload, "sha256=abc", secret)).not.toThrow();
    expect(verifyWebhookSignature(payload, "sha256=abc", secret)).toBe(false);
  });

  it("works identically for a Buffer payload as for the equivalent string", () => {
    const signature = sign(payload, secret);
    expect(verifyWebhookSignature(Buffer.from(payload, "utf8"), signature, secret)).toBe(true);
  });
});
