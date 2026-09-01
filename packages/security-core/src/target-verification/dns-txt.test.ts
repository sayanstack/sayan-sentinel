import { describe, expect, it } from "vitest";
import { verifyDnsTxtChallenge } from "./dns-txt";

describe("verifyDnsTxtChallenge", () => {
  it("verifies when a TXT record matches the expected challenge value", async () => {
    const result = await verifyDnsTxtChallenge("example.com", "abc123", {
      resolveTxt: async (hostname) => {
        expect(hostname).toBe("_sentinel-verification.example.com");
        return [["sentinel-verification=abc123"]];
      },
    });
    expect(result.verified).toBe(true);
    expect(result.method).toBe("dns_txt");
  });

  it("joins multi-chunk TXT record strings before comparing", async () => {
    const result = await verifyDnsTxtChallenge("example.com", "abc123", {
      resolveTxt: async () => [["sentinel-verification=", "abc123"]],
    });
    expect(result.verified).toBe(true);
  });

  it("does not verify when no TXT record matches", async () => {
    const result = await verifyDnsTxtChallenge("example.com", "abc123", {
      resolveTxt: async () => [["sentinel-verification=wrong-value"], ["v=spf1 -all"]],
    });
    expect(result.verified).toBe(false);
  });

  it("does not verify when the TXT lookup fails", async () => {
    const result = await verifyDnsTxtChallenge("example.com", "abc123", {
      resolveTxt: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(result.verified).toBe(false);
    expect(result.detail).toContain("ENOTFOUND");
  });

  it("does not verify a challenge value that is a substring of the real record (no partial match)", async () => {
    const result = await verifyDnsTxtChallenge("example.com", "abc", {
      resolveTxt: async () => [["sentinel-verification=abc123"]],
    });
    expect(result.verified).toBe(false);
  });
});
