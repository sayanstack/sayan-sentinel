import { describe, expect, it } from "vitest";
import { SafeHttpClient } from "./SafeHttpClient";
import type { FetchResponseLike, SafeHttpClientOptions } from "./types";
import type { TargetAuthorizationRecord } from "@sayan-sentinel/security-core";

const NOW = new Date("2026-08-31T00:00:00Z");
const FUTURE = new Date("2026-12-31T00:00:00Z");

function authorization(
  overrides: Partial<TargetAuthorizationRecord> = {},
): TargetAuthorizationRecord {
  return {
    id: "auth-1",
    scheme: "https",
    host: "target.example.com",
    port: 443,
    allowedPathPrefixes: [],
    maxTier: 1,
    expiresAt: FUTURE,
    verifiedAt: NOW,
    revokedAt: null,
    ...overrides,
  };
}

function baseOptions(overrides: Partial<SafeHttpClientOptions> = {}): SafeHttpClientOptions {
  return {
    authorizations: [authorization()],
    tier: 0,
    localLabMode: false,
    now: NOW,
    resolver: async () => ["93.184.216.34"],
    ...overrides,
  };
}

function fakeResponse(overrides: Partial<FetchResponseLike> = {}): FetchResponseLike {
  return { status: 200, headers: {}, setCookieHeaders: [], text: async () => "", ...overrides };
}

describe("SafeHttpClient", () => {
  it("makes a request and returns the response when Scope Guard allows it", async () => {
    const client = new SafeHttpClient(
      baseOptions({
        fetchImpl: async () =>
          fakeResponse({ headers: { "content-type": "text/html" }, text: async () => "hello" }),
      }),
    );
    const outcome = await client.request("https://target.example.com/");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.response.body).toBe("hello");
      expect(outcome.response.status).toBe(200);
    }
  });

  it("refuses a request Scope Guard denies, without ever calling fetch", async () => {
    let fetchCalled = false;
    const client = new SafeHttpClient(
      baseOptions({
        authorizations: [],
        fetchImpl: async () => {
          fetchCalled = true;
          return fakeResponse();
        },
      }),
    );
    const outcome = await client.request("https://unauthorized.example.com/");
    expect(outcome.ok).toBe(false);
    expect(fetchCalled).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("scope_denied");
  });

  it("rejects a disallowed HTTP method before ever checking Scope Guard or calling fetch", async () => {
    let fetchCalled = false;
    const client = new SafeHttpClient(
      baseOptions({
        fetchImpl: async () => {
          fetchCalled = true;
          return fakeResponse();
        },
      }),
    );
    const outcome = await client.request("https://target.example.com/", { method: "DELETE" });
    expect(outcome.ok).toBe(false);
    expect(fetchCalled).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("method_not_allowed");
  });

  it("follows a redirect and re-checks Scope Guard against the redirect target", async () => {
    const checkedUrls: string[] = [];
    const client = new SafeHttpClient({
      ...baseOptions({
        authorizations: [
          authorization({ host: "target.example.com" }),
          authorization({ id: "auth-2", host: "final.example.com" }),
        ],
      }),
      onAudit: (event) => {
        if (event.type === "scope_check") checkedUrls.push(event.url);
      },
      fetchImpl: async (url) => {
        if (url === "https://target.example.com/") {
          return fakeResponse({
            status: 302,
            headers: { location: "https://final.example.com/landed" },
          });
        }
        return fakeResponse({ text: async () => "landed" });
      },
    });

    const outcome = await client.request("https://target.example.com/");
    expect(outcome.ok).toBe(true);
    expect(checkedUrls).toEqual([
      "https://target.example.com/",
      "https://final.example.com/landed",
    ]);
    if (outcome.ok) {
      expect(outcome.response.url).toBe("https://final.example.com/landed");
      expect(outcome.response.redirectChain).toEqual(["https://target.example.com/"]);
    }
  });

  it("refuses to follow a redirect to a target that is not itself authorized (redirect escape)", async () => {
    let secondFetchCalled = false;
    const client = new SafeHttpClient(
      baseOptions({
        fetchImpl: async (url) => {
          if (url === "https://target.example.com/") {
            return fakeResponse({
              status: 302,
              headers: { location: "https://unauthorized-elsewhere.example.com/" },
            });
          }
          secondFetchCalled = true;
          return fakeResponse();
        },
      }),
    );

    const outcome = await client.request("https://target.example.com/");
    expect(outcome.ok).toBe(false);
    expect(secondFetchCalled).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("scope_denied");
  });

  it("gives up after the configured maximum number of redirects", async () => {
    let hops = 0;
    const client = new SafeHttpClient(
      baseOptions({
        maxRedirects: 2,
        fetchImpl: async () => {
          hops++;
          return fakeResponse({
            status: 302,
            headers: { location: "https://target.example.com/next" },
          });
        },
      }),
    );
    const outcome = await client.request("https://target.example.com/");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("too_many_redirects");
    expect(hops).toBe(3); // initial + 2 redirects
  });

  it("truncates a streamed response body at the configured byte cap", async () => {
    async function* chunks() {
      yield new TextEncoder().encode("a".repeat(10));
      yield new TextEncoder().encode("b".repeat(10));
    }
    const client = new SafeHttpClient(
      baseOptions({
        maxResponseBytes: 15,
        fetchImpl: async () => fakeResponse({ body: chunks() }),
      }),
    );
    const outcome = await client.request("https://target.example.com/");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.response.body).toHaveLength(15);
      expect(outcome.response.truncated).toBe(true);
    }
  });

  it("does not mark the body truncated when it fits within the byte cap", async () => {
    const client = new SafeHttpClient(
      baseOptions({
        maxResponseBytes: 100,
        fetchImpl: async () => fakeResponse({ text: async () => "short body" }),
      }),
    );
    const outcome = await client.request("https://target.example.com/");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.response.truncated).toBe(false);
  });

  it("reports a timeout distinctly from a generic network error", async () => {
    const client = new SafeHttpClient(
      baseOptions({
        fetchImpl: async () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        },
      }),
    );
    const outcome = await client.request("https://target.example.com/");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("timeout");
  });

  it("forwards custom request headers to the underlying fetch implementation", async () => {
    let receivedHeaders: Record<string, string> | undefined;
    const client = new SafeHttpClient(
      baseOptions({
        fetchImpl: async (_url, init) => {
          receivedHeaders = init.headers;
          return fakeResponse();
        },
      }),
    );
    await client.request("https://target.example.com/", {
      headers: { Origin: "https://example.org" },
    });
    expect(receivedHeaders).toEqual({ Origin: "https://example.org" });
  });

  it("collects Set-Cookie headers separately from ordinary headers", async () => {
    const client = new SafeHttpClient(
      baseOptions({
        fetchImpl: async () => fakeResponse({ setCookieHeaders: ["a=1; Secure", "b=2; HttpOnly"] }),
      }),
    );
    const outcome = await client.request("https://target.example.com/");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.response.setCookieHeaders).toEqual(["a=1; Secure", "b=2; HttpOnly"]);
    }
  });
});
