import type { CorrelatedFinding, SecurityScoreResult } from "@sayan-sentinel/findings";
import type { NormalizedRoute } from "@sayan-sentinel/source-runtime-correlation";
import type {
  BoundedCrawler,
  CrawlOptions,
  CrawlResult,
  SafeHttpClient,
  SafeHttpClientOptions,
  WebFinding,
  WebSecurityScanResult,
} from "@sayan-sentinel/web-security-engine";
import type { ScanPipelineDependencies, ScanPipelineInput, ScanPipelineResult } from "./types";

export interface WebTargetInput {
  baseUrl: string;
  /** Every field `evaluateScopeGuard`/`SafeHttpClient` need — a verified `TargetAuthorization`, converted via `toScopeGuardRecord` in `apps/api`, feeds this. */
  scopeGuard: SafeHttpClientOptions;
  crawlOptions?: CrawlOptions;
}

export interface FullStackScanInput {
  code: ScanPipelineInput;
  /** Omitted entirely when no verified deployment exists for this repository — a Full Stack Scan degrades to a code-only scan, never a fabricated web result. */
  webTarget?: WebTargetInput;
}

export interface FullStackScanDependencies extends ScanPipelineDependencies {
  /** Injectable for tests; defaults to a real `BoundedCrawler`. */
  createCrawler?: (client: SafeHttpClient, options?: CrawlOptions) => Pick<BoundedCrawler, "crawl">;
  /** Injectable for tests; defaults to the real `scanUrl`. */
  scanUrl?: (url: string, options: SafeHttpClientOptions) => Promise<WebSecurityScanResult>;
}

export interface RouteCorrelationMatch {
  runtimeMethod: string;
  runtimePath: string;
  sourceRoute: NormalizedRoute;
  params: Record<string, string>;
}

export interface RouteCorrelationResult {
  sourceRoutes: NormalizedRoute[];
  runtimeRequestCount: number;
  matched: RouteCorrelationMatch[];
  unmatchedRuntimeRequests: Array<{ method: string; path: string }>;
  unmatchedSourceRoutes: NormalizedRoute[];
}

export interface FullStackScanResult {
  code: ScanPipelineResult;
  /** Present only when `input.webTarget` was supplied and reachable. */
  web?: { crawl: CrawlResult; findings: WebFinding[] };
  /** Present whenever source routes were extractable, even without a web target (in which case every source route is trivially "unmatched" — never observed at runtime this scan). */
  routeCorrelation?: RouteCorrelationResult;
  /** Code findings and web findings concatenated after each side is independently correlated — see the module docstring on why cross-layer correlation isn't attempted yet. */
  correlatedFindings: CorrelatedFinding[];
  securityScore: SecurityScoreResult;
  durationMs: number;
}
