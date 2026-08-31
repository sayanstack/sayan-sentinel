import { describe, expect, it } from "vitest";
import { verifyHttpWellKnownChallenge } from "./http-well-known";

function fakeFetch(body: string, status = 200) {
  return async (_url: string) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

describe("verifyHttpWellKnownChallenge", () => {
  it("verifies when the response body matches the challenge exactly", async () => {
    const result = await verifyHttpWellKnownChallenge(
      "https",
      "target.example.com",
      443,
      "abc123",
      {
        dnsResolver: async () => ["93.184.216.34"],
        fetchImpl: fakeFetch("abc123"),
      },
    );
    expect(result.verified).toBe(true);
    expect(result.method).toBe("http_well_known");
  });

  it("trims surrounding whitespace before comparing", async () => {
    const result = await verifyHttpWellKnownChallenge(
      "https",
      "target.example.com",
      443,
      "abc123",
      {
        dnsResolver: async () => ["93.184.216.34"],
        fetchImpl: fakeFetch("  abc123\n"),
      },
    );
    expect(result.verified).toBe(true);
  });

  it("does not verify a non-matching response body", async () => {
    const result = await verifyHttpWellKnownChallenge(
      "https",
      "target.example.com",
      443,
      "abc123",
      {
        dnsResolver: async () => ["93.184.216.34"],
        fetchImpl: fakeFetch("wrong-value"),
      },
    );
    expect(result.verified).toBe(false);
  });

  it("does not verify a non-2xx response", async () => {
    const result = await verifyHttpWellKnownChallenge(
      "https",
      "target.example.com",
      443,
      "abc123",
      {
        dnsResolver: async () => ["93.184.216.34"],
        fetchImpl: fakeFetch("abc123", 404),
      },
    );
    expect(result.verified).toBe(false);
    expect(result.detail).toContain("404");
  });

  it("refuses to verify (fails closed) a target that resolves to a private address, without ever calling fetch", async () => {
    let fetchCalled = false;
    const result = await verifyHttpWellKnownChallenge(
      "http",
      "internal.example.com",
      80,
      "abc123",
      {
        dnsResolver: async () => ["10.0.0.5"],
        fetchImpl: async (_url) => {
          fetchCalled = true;
          return { ok: true, status: 200, text: async () => "abc123" };
        },
      },
    );
    expect(result.verified).toBe(false);
    expect(fetchCalled).toBe(false);
    expect(result.detail).toContain("Refused");
  });

  it("refuses to verify a literal loopback target even without DNS resolution", async () => {
    const result = await verifyHttpWellKnownChallenge("http", "127.0.0.1", 80, "abc123", {
      fetchImpl: fakeFetch("abc123"),
    });
    expect(result.verified).toBe(false);
  });

  it("builds the request URL without an explicit port for the scheme's default port", async () => {
    let requestedUrl = "";
    await verifyHttpWellKnownChallenge("https", "target.example.com", 443, "abc123", {
      dnsResolver: async () => ["93.184.216.34"],
      fetchImpl: async (url) => {
        requestedUrl = url;
        return { ok: true, status: 200, text: async () => "abc123" };
      },
    });
    expect(requestedUrl).toBe("https://target.example.com/.well-known/sentinel-verification");
  });

  it("includes a non-default port explicitly in the request URL", async () => {
    let requestedUrl = "";
    await verifyHttpWellKnownChallenge("https", "target.example.com", 8443, "abc123", {
      dnsResolver: async () => ["93.184.216.34"],
      fetchImpl: async (url) => {
        requestedUrl = url;
        return { ok: true, status: 200, text: async () => "abc123" };
      },
    });
    expect(requestedUrl).toBe("https://target.example.com:8443/.well-known/sentinel-verification");
  });
});
