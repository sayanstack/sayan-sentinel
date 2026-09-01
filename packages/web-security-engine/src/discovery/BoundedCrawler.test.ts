import { describe, expect, it } from "vitest";
import { BoundedCrawler } from "./BoundedCrawler";
import { SafeHttpClient } from "../http/SafeHttpClient";
import type { FetchResponseLike } from "../http/types";
import type { TargetAuthorizationRecord } from "@sayan-sentinel/security-core";

const FUTURE = new Date("2026-12-31T00:00:00Z");
const NOW = new Date("2026-08-31T00:00:00Z");

function authorization(host = "example.com"): TargetAuthorizationRecord {
  return {
    id: "auth-1",
    scheme: "https",
    host,
    port: 443,
    allowedPathPrefixes: [],
    maxTier: 1,
    expiresAt: FUTURE,
    verifiedAt: NOW,
    revokedAt: null,
  };
}

function siteClient(
  pages: Record<string, { status?: number; body: string; contentType?: string }>,
  extraAuthorizations: TargetAuthorizationRecord[] = [],
): SafeHttpClient {
  return new SafeHttpClient({
    authorizations: [authorization(), ...extraAuthorizations],
    tier: 0,
    now: NOW,
    resolver: async () => ["93.184.216.34"],
    fetchImpl: async (url): Promise<FetchResponseLike> => {
      const path = new URL(url).pathname;
      const entry = pages[path];
      if (!entry) return { status: 404, headers: {}, text: async () => "" };
      return {
        status: entry.status ?? 200,
        headers: { "content-type": entry.contentType ?? "text/html" },
        text: async () => entry.body,
      };
    },
  });
}

describe("BoundedCrawler", () => {
  it("discovers pages by following same-origin links up to maxDepth", async () => {
    const client = siteClient({
      "/robots.txt": { status: 404, body: "" },
      "/": { body: `<a href="/about">About</a> <a href="/contact">Contact</a>` },
      "/about": { body: `<a href="/team">Team</a>` },
      "/contact": { body: `no links` },
      "/team": { body: `should not be reached at depth 2` },
    });

    const crawler = new BoundedCrawler(client, { maxDepth: 2, respectRobotsTxt: false });
    const result = await crawler.crawl("https://example.com/");

    const visitedPaths = result.pages.map((p) => new URL(p.url).pathname).sort();
    expect(visitedPaths).toEqual(["/", "/about", "/contact", "/team"]);
    expect(result.truncated).toBe(false);
  });

  it("does not exceed maxDepth", async () => {
    const client = siteClient({
      "/robots.txt": { status: 404, body: "" },
      "/": { body: `<a href="/level1">L1</a>` },
      "/level1": { body: `<a href="/level2">L2</a>` },
      "/level2": { body: `<a href="/level3">L3</a>` },
    });

    const crawler = new BoundedCrawler(client, { maxDepth: 1, respectRobotsTxt: false });
    const result = await crawler.crawl("https://example.com/");

    const visitedPaths = result.pages.map((p) => new URL(p.url).pathname).sort();
    expect(visitedPaths).toEqual(["/", "/level1"]);
  });

  it("never follows an external-origin link", async () => {
    const client = siteClient({
      "/robots.txt": { status: 404, body: "" },
      "/": {
        body: `<a href="https://evil.example.org/steal">External</a> <a href="/safe">Internal</a>`,
      },
      "/safe": { body: "ok" },
    });

    const crawler = new BoundedCrawler(client, { respectRobotsTxt: false });
    const result = await crawler.crawl("https://example.com/");

    const visitedPaths = result.pages.map((p) => new URL(p.url).pathname).sort();
    expect(visitedPaths).toEqual(["/", "/safe"]);
    expect(result.skippedExternal).toContain("https://evil.example.org/steal");
  });

  it("stops at maxPages and reports truncated", async () => {
    const pages: Record<string, { body: string }> = { "/robots.txt": { body: "" } };
    for (let i = 0; i < 10; i++) {
      pages[`/page${i}`] = { body: `<a href="/page${i + 1}">next</a>` };
    }
    const client = siteClient(pages as never);

    const crawler = new BoundedCrawler(client, {
      maxDepth: 20,
      maxPages: 3,
      respectRobotsTxt: false,
    });
    const result = await crawler.crawl("https://example.com/page0");

    expect(result.pages.length).toBeLessThanOrEqual(3);
    expect(result.truncated).toBe(true);
  });

  it("skips static assets by default", async () => {
    const client = siteClient({
      "/robots.txt": { status: 404, body: "" },
      "/": { body: `<a href="/style.css">CSS</a> <a href="/page">Page</a>` },
      "/page": { body: "ok" },
    });

    const crawler = new BoundedCrawler(client, { respectRobotsTxt: false });
    const result = await crawler.crawl("https://example.com/");

    const visitedPaths = result.pages.map((p) => new URL(p.url).pathname);
    expect(visitedPaths).not.toContain("/style.css");
  });

  it("extracts forms discovered on crawled pages", async () => {
    const client = siteClient({
      "/robots.txt": { status: 404, body: "" },
      "/": { body: `<form action="/login" method="post"><input name="username"></form>` },
    });

    const crawler = new BoundedCrawler(client, { respectRobotsTxt: false });
    const result = await crawler.crawl("https://example.com/");

    expect(result.pages[0]?.forms).toEqual([
      { action: "/login", method: "POST", fieldNames: ["username"] },
    ]);
  });

  it("respects robots.txt disallow rules by default", async () => {
    const client = siteClient({
      "/robots.txt": { body: "User-agent: *\nDisallow: /admin\n" },
      "/": { body: `<a href="/admin/panel">Admin</a> <a href="/public">Public</a>` },
      "/admin/panel": { body: "should not be crawled" },
      "/public": { body: "ok" },
    });

    const crawler = new BoundedCrawler(client);
    const result = await crawler.crawl("https://example.com/");

    const visitedPaths = result.pages.map((p) => new URL(p.url).pathname);
    expect(visitedPaths).not.toContain("/admin/panel");
    expect(visitedPaths).toContain("/public");
  });

  it("records a scope-guard denial as an error rather than throwing", async () => {
    // The authorization is for example.com; crawling an unauthorized host
    // must be refused at the very first request, not silently followed.
    const client = new SafeHttpClient({
      authorizations: [authorization()],
      tier: 0,
      now: NOW,
      resolver: async () => ["93.184.216.34"],
      fetchImpl: async (): Promise<FetchResponseLike> => ({
        status: 200,
        headers: {},
        text: async () => "",
      }),
    });

    const crawler = new BoundedCrawler(client, { respectRobotsTxt: false });
    const result = await crawler.crawl("https://not-authorized.example.com/");

    expect(result.pages).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain("scope_denied");
  });

  it("does not visit the same URL twice even if linked from multiple pages", async () => {
    const client = siteClient({
      "/robots.txt": { status: 404, body: "" },
      "/": { body: `<a href="/a">A</a> <a href="/b">B</a>` },
      "/a": { body: `<a href="/shared">Shared</a>` },
      "/b": { body: `<a href="/shared">Shared</a>` },
      "/shared": { body: "ok" },
    });

    const crawler = new BoundedCrawler(client, { respectRobotsTxt: false });
    const result = await crawler.crawl("https://example.com/");

    const sharedVisits = result.pages.filter((p) => new URL(p.url).pathname === "/shared");
    expect(sharedVisits).toHaveLength(1);
  });
});
