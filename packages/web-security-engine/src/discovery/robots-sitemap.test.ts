import { describe, expect, it } from "vitest";
import { fetchRobotsDisallowedPaths, fetchSitemapUrls, isPathDisallowed } from "./robots-sitemap";
import { SafeHttpClient } from "../http/SafeHttpClient";
import type { FetchResponseLike } from "../http/types";
import type { TargetAuthorizationRecord } from "@sayan-sentinel/security-core";

const FUTURE = new Date("2026-12-31T00:00:00Z");
const NOW = new Date("2026-08-31T00:00:00Z");

function authorization(): TargetAuthorizationRecord {
  return {
    id: "auth-1",
    scheme: "https",
    host: "example.com",
    port: 443,
    allowedPathPrefixes: [],
    maxTier: 1,
    expiresAt: FUTURE,
    verifiedAt: NOW,
    revokedAt: null,
  };
}

function clientReturning(
  responsesByPath: Record<string, { status: number; body: string }>,
): SafeHttpClient {
  return new SafeHttpClient({
    authorizations: [authorization()],
    tier: 0,
    now: NOW,
    resolver: async () => ["93.184.216.34"],
    fetchImpl: async (url): Promise<FetchResponseLike> => {
      const path = new URL(url).pathname;
      const entry = responsesByPath[path];
      if (!entry) return { status: 404, headers: {}, text: async () => "" };
      return { status: entry.status, headers: {}, text: async () => entry.body };
    },
  });
}

describe("fetchRobotsDisallowedPaths", () => {
  it("extracts Disallow paths under the wildcard user-agent group", async () => {
    const client = clientReturning({
      "/robots.txt": {
        status: 200,
        body: "User-agent: *\nDisallow: /admin\nDisallow: /internal\n",
      },
    });
    const paths = await fetchRobotsDisallowedPaths(client, "https://example.com");
    expect(paths).toEqual(["/admin", "/internal"]);
  });

  it("ignores Disallow rules under a non-wildcard user-agent group", async () => {
    const client = clientReturning({
      "/robots.txt": {
        status: 200,
        body: "User-agent: Googlebot\nDisallow: /googlebot-only\n\nUser-agent: *\nDisallow: /general\n",
      },
    });
    const paths = await fetchRobotsDisallowedPaths(client, "https://example.com");
    expect(paths).toEqual(["/general"]);
  });

  it("returns an empty array when robots.txt is missing", async () => {
    const client = clientReturning({});
    expect(await fetchRobotsDisallowedPaths(client, "https://example.com")).toEqual([]);
  });
});

describe("fetchSitemapUrls", () => {
  it("extracts loc URLs from a sitemap", async () => {
    const client = clientReturning({
      "/sitemap.xml": {
        status: 200,
        body: `<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>`,
      },
    });
    const urls = await fetchSitemapUrls(client, "https://example.com");
    expect(urls).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("returns an empty array when the sitemap is missing", async () => {
    const client = clientReturning({});
    expect(await fetchSitemapUrls(client, "https://example.com")).toEqual([]);
  });
});

describe("isPathDisallowed", () => {
  it("matches a path under a disallowed prefix", () => {
    expect(isPathDisallowed("/admin/users", ["/admin"])).toBe(true);
  });

  it("does not match an unrelated path", () => {
    expect(isPathDisallowed("/public/page", ["/admin"])).toBe(false);
  });
});
