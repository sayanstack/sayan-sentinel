import type { SafeHttpClient } from "../http/SafeHttpClient";
import { extractForms, extractLinks, extractScriptSrcs, type DiscoveredForm } from "./html-extract";
import { fetchRobotsDisallowedPaths, isPathDisallowed } from "./robots-sitemap";
import { canonicalizeUrl, isSameOrigin, isStaticAssetPath } from "./url-canonicalize";

export interface DiscoveredPage {
  url: string;
  depth: number;
  status: number;
  links: string[];
  scripts: string[];
  forms: DiscoveredForm[];
}

export interface CrawlOptions {
  /** Default 2 — how many link-hops from the start URL to follow. */
  maxDepth?: number;
  /** Default 25 — total pages fetched, regardless of how many more are queued. */
  maxPages?: number;
  /** Default 30s wall-clock budget for the whole crawl. */
  maxDurationMs?: number;
  /** Default false — skip stylesheet/image/font/etc URLs entirely; they're never a security-relevant page to crawl into. */
  includeStaticAssets?: boolean;
  /** Default true — honor `Disallow:` rules from the target's `/robots.txt`. */
  respectRobotsTxt?: boolean;
}

export interface CrawlResult {
  startUrl: string;
  pages: DiscoveredPage[];
  visitedCount: number;
  /** External-origin URLs encountered but never followed — Sentinel never crawls off the authorized origin. */
  skippedExternal: string[];
  /** True when a budget (pages/duration) was hit before the frontier was exhausted — the crawl is a partial view, not necessarily the whole site. */
  truncated: boolean;
  errors: Array<{ url: string; reason: string }>;
}

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_PAGES = 25;
const DEFAULT_MAX_DURATION_MS = 30_000;

/**
 * A conservative, same-origin-only, budget-bounded crawler. Every request
 * it makes goes through the `SafeHttpClient` it's constructed with, so
 * Scope Guard authorization and every other `SafeHttpClient` protection
 * (timeouts, response caps, redirect re-checks) already apply — this
 * class adds only discovery logic (link/form/script extraction, frontier
 * management, dedup, depth/page/duration budgets) on top, never makes a
 * request of its own. It never follows an external-origin link (Section
 * "Web Discovery Engine" — "never follow external domains/CDNs/analytics/
 * ads/social unless independently authorized").
 */
export class BoundedCrawler {
  constructor(
    private readonly client: SafeHttpClient,
    private readonly options: CrawlOptions = {},
  ) {}

  async crawl(startUrl: string): Promise<CrawlResult> {
    const maxDepth = this.options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const maxPages = this.options.maxPages ?? DEFAULT_MAX_PAGES;
    const maxDurationMs = this.options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    const includeStaticAssets = this.options.includeStaticAssets ?? false;
    const respectRobotsTxt = this.options.respectRobotsTxt ?? true;

    const origin = new URL(startUrl).origin;
    const canonicalStart = canonicalizeUrl(startUrl, startUrl);
    if (!canonicalStart) {
      return {
        startUrl,
        pages: [],
        visitedCount: 0,
        skippedExternal: [],
        truncated: false,
        errors: [{ url: startUrl, reason: "invalid start URL" }],
      };
    }

    const disallowedPaths = respectRobotsTxt
      ? await fetchRobotsDisallowedPaths(this.client, origin)
      : [];

    const visited = new Set<string>();
    const externalSeen = new Set<string>();
    const pages: DiscoveredPage[] = [];
    const errors: Array<{ url: string; reason: string }> = [];
    const startedAt = Date.now();
    let truncated = false;

    const queue: Array<{ url: string; depth: number }> = [{ url: canonicalStart, depth: 0 }];

    while (queue.length > 0) {
      if (pages.length >= maxPages) {
        truncated = true;
        break;
      }
      if (Date.now() - startedAt >= maxDurationMs) {
        truncated = true;
        break;
      }

      const next = queue.shift();
      if (!next || visited.has(next.url)) continue;
      visited.add(next.url);

      const outcome = await this.client.request(next.url);
      if (!outcome.ok) {
        errors.push({ url: next.url, reason: `${outcome.reason}: ${outcome.detail}` });
        continue;
      }

      const contentType = outcome.response.headers["content-type"] ?? "";
      const isHtml = contentType === "" || contentType.includes("text/html");
      const rawLinks = isHtml ? extractLinks(outcome.response.body) : [];
      const rawScripts = isHtml ? extractScriptSrcs(outcome.response.body) : [];
      const forms = isHtml ? extractForms(outcome.response.body) : [];

      const pageLinks: string[] = [];
      const pageScripts: string[] = [];

      for (const [rawUrl, bucket] of [
        ...rawLinks.map((u) => [u, pageLinks] as const),
        ...rawScripts.map((u) => [u, pageScripts] as const),
      ]) {
        const canonical = canonicalizeUrl(rawUrl, next.url);
        if (!canonical) continue;
        if (!isSameOrigin(canonical, origin)) {
          externalSeen.add(canonical);
          continue;
        }
        bucket.push(canonical);

        const pathname = new URL(canonical).pathname;
        if (!includeStaticAssets && isStaticAssetPath(pathname)) continue;
        if (isPathDisallowed(pathname, disallowedPaths)) continue;
        if (next.depth >= maxDepth || visited.has(canonical)) continue;
        queue.push({ url: canonical, depth: next.depth + 1 });
      }

      pages.push({
        url: next.url,
        depth: next.depth,
        status: outcome.response.status,
        links: pageLinks,
        scripts: pageScripts,
        forms,
      });
    }

    return {
      startUrl: canonicalStart,
      pages,
      visitedCount: visited.size,
      skippedExternal: [...externalSeen],
      truncated,
      errors,
    };
  }
}
