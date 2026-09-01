import type { TargetAuthorization } from "@sayan-sentinel/database";
import {
  BoundedCrawler,
  SafeHttpClient,
  scanUrl,
  type CrawlResult,
  type WebFinding,
} from "@sayan-sentinel/web-security-engine";
import { toScopeGuardRecord } from "./to-scope-guard-record";

export interface QuickScanResult {
  scannedUrl: string;
  /** The scheme actually reachable — may differ from `target.scheme` when the https attempt failed and the http fallback succeeded. */
  schemeUsed: "http" | "https";
  visitedCount: number;
  truncated: boolean;
  findings: WebFinding[];
  /** Set when neither https nor http (for a target originally on https) was reachable at all. */
  fetchError?: string;
}

const QUICK_SCAN_OPTIONS = {
  maxDepth: 2,
  maxPages: 15,
  maxDurationMs: 20_000,
};

/**
 * Runs one bounded, passive Web Security Engine pass against an already-
 * verified target and returns the findings directly in the response —
 * this is the "start scanning the moment ownership is verified" path for
 * a target with no linked repository, so it deliberately does not go
 * through `runFullStackScanPipeline` (which requires a git repository to
 * clone) or persist a `Scan`/`Finding` row (`Scan.repositoryId` is a
 * required, non-nullable column today — see docs/implementation-plan.md
 * Phase 27's own note that web-only scan persistence isn't wired yet).
 * A caller that also has a linked repository still gets the full,
 * persisted pipeline through the existing scan path; this is the
 * additional, honestly-unpersisted quick-look path for a bare domain.
 *
 * Tries the target's stored scheme first; if that's `https` and the
 * first request never gets a response at all (a real connection/DNS
 * failure, not an HTTP error status), retries once over plain `http` on
 * port 80 — the user is never asked to pick a scheme up front.
 */
export async function runQuickScan(target: TargetAuthorization): Promise<QuickScanResult> {
  const authorization = toScopeGuardRecord(target);
  const scopeGuard = { authorizations: [authorization], tier: 0 as const };

  const primaryUrl = `${target.scheme}://${target.host}:${target.port}`;
  const primary = await crawlAndScan(primaryUrl, scopeGuard);

  if (!isUnreachable(primary) || target.scheme !== "https") {
    return { ...primary, scannedUrl: primaryUrl, schemeUsed: target.scheme as "http" | "https" };
  }

  const fallbackUrl = `http://${target.host}:80`;
  const fallback = await crawlAndScan(fallbackUrl, scopeGuard);
  if (!isUnreachable(fallback)) {
    return { ...fallback, scannedUrl: fallbackUrl, schemeUsed: "http" };
  }

  return { ...primary, scannedUrl: primaryUrl, schemeUsed: "https" };
}

function isUnreachable(result: Omit<QuickScanResult, "scannedUrl" | "schemeUsed">): boolean {
  return result.visitedCount === 0 && !!result.fetchError;
}

async function crawlAndScan(
  baseUrl: string,
  scopeGuard: { authorizations: ReturnType<typeof toScopeGuardRecord>[]; tier: 0 },
): Promise<Omit<QuickScanResult, "scannedUrl" | "schemeUsed">> {
  const client = new SafeHttpClient(scopeGuard);
  const crawler = new BoundedCrawler(client, QUICK_SCAN_OPTIONS);

  let crawl: CrawlResult;
  try {
    crawl = await crawler.crawl(baseUrl);
  } catch (error) {
    return {
      visitedCount: 0,
      truncated: false,
      findings: [],
      fetchError: error instanceof Error ? error.message : "network_error",
    };
  }

  if (crawl.pages.length === 0) {
    return {
      visitedCount: 0,
      truncated: false,
      findings: [],
      fetchError: crawl.errors[0]?.reason ?? "No pages were reachable at this address.",
    };
  }

  const findings: WebFinding[] = [];
  for (const page of crawl.pages) {
    const result = await scanUrl(page.url, scopeGuard);
    findings.push(...result.findings);
  }

  return {
    visitedCount: crawl.visitedCount,
    truncated: crawl.truncated,
    findings,
  };
}
