import type { SafeHttpClient } from "../http/SafeHttpClient";

const SITEMAP_LOC_PATTERN = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

/**
 * Fetches and parses `/robots.txt` for `Disallow:` paths under the
 * default (`User-agent: *`) group, so the crawler can respect a site
 * owner's stated crawl preferences — the same courtesy any well-behaved
 * crawler extends, on top of (not instead of) the hard authorization
 * boundary Scope Guard already enforces. Returns an empty array (crawl
 * everything in scope) when robots.txt is missing, unreachable, or has no
 * disallow rules — a missing robots.txt is not itself a signal to avoid
 * the site.
 */
export async function fetchRobotsDisallowedPaths(
  client: SafeHttpClient,
  origin: string,
): Promise<string[]> {
  const outcome = await client.request(new URL("/robots.txt", origin).toString());
  if (!outcome.ok || outcome.response.status !== 200) return [];

  const disallowed: string[] = [];
  let inWildcardGroup = false;
  for (const rawLine of outcome.response.body.split("\n")) {
    const line = rawLine.trim();
    if (/^user-agent\s*:/i.test(line)) {
      inWildcardGroup = /^user-agent\s*:\s*\*/i.test(line);
      continue;
    }
    if (!inWildcardGroup) continue;
    const disallowMatch = /^disallow\s*:\s*(\S+)/i.exec(line);
    if (disallowMatch?.[1]) disallowed.push(disallowMatch[1]);
  }

  return disallowed;
}

/**
 * Fetches and parses `/sitemap.xml` for `<loc>` URLs, as additional
 * discovery seeds beyond whatever the crawler finds by following links —
 * a sitemap often lists pages with no inbound link from the homepage.
 * Returns an empty array when the sitemap is missing or unreachable.
 */
export async function fetchSitemapUrls(client: SafeHttpClient, origin: string): Promise<string[]> {
  const outcome = await client.request(new URL("/sitemap.xml", origin).toString());
  if (!outcome.ok || outcome.response.status !== 200) return [];

  const urls: string[] = [];
  let match: RegExpExecArray | null;
  SITEMAP_LOC_PATTERN.lastIndex = 0;
  while ((match = SITEMAP_LOC_PATTERN.exec(outcome.response.body))) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
}

export function isPathDisallowed(pathname: string, disallowedPrefixes: string[]): boolean {
  return disallowedPrefixes.some((prefix) => pathname.startsWith(prefix));
}
