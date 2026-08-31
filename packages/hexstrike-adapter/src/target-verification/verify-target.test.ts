import { describe, expect, it } from "vitest";
import { verifyTarget } from "./verify-target";
import type { VerificationTarget } from "./types";

describe("verifyTarget", () => {
  it("dispatches to DNS TXT verification for a dns_txt target", async () => {
    const target: VerificationTarget = {
      scheme: "https",
      host: "example.com",
      port: 443,
      method: "dns_txt",
      challenge: "abc123",
    };
    const result = await verifyTarget(target, {
      resolveTxt: async () => [["sentinel-verification=abc123"]],
    });
    expect(result.method).toBe("dns_txt");
    expect(result.verified).toBe(true);
  });

  it("dispatches to HTTP well-known verification for an http_well_known target", async () => {
    const target: VerificationTarget = {
      scheme: "https",
      host: "target.example.com",
      port: 443,
      method: "http_well_known",
      challenge: "abc123",
    };
    const result = await verifyTarget(target, {
      dnsResolver: async () => ["93.184.216.34"],
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => "abc123" }),
    });
    expect(result.method).toBe("http_well_known");
    expect(result.verified).toBe(true);
  });
});
