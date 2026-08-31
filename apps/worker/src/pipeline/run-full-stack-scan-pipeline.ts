import {
  extractRouteHandlers,
  loadProjectFromDirectory,
  toRelativePath,
} from "@sayan-sentinel/rules-engine";
import {
  computeSecurityScore,
  correlateFindings,
  type CorrelatedFinding,
} from "@sayan-sentinel/findings";
import {
  correlateRuntimeRequest,
  type NormalizedRoute,
} from "@sayan-sentinel/source-runtime-correlation";
import {
  BoundedCrawler,
  SafeHttpClient,
  scanUrl as defaultScanUrl,
  webFindingToDraft,
  type CrawlResult,
} from "@sayan-sentinel/web-security-engine";
import { runScanPipeline } from "./run-scan-pipeline";
import type {
  FullStackScanDependencies,
  FullStackScanInput,
  FullStackScanResult,
  RouteCorrelationResult,
} from "./full-stack-scan-types";

/**
 * Orchestrates a Full Stack Scan: the existing code scan pipeline
 * unmodified, plus — only when a verified web target is supplied — a
 * bounded crawl, passive web analysis of every discovered page, and
 * source-to-runtime route correlation, with the two findings sets
 * combined into one list and one recomputed Security Score.
 *
 * **Cross-layer correlation is not attempted**: code findings and web
 * findings are independently correlated among their own detectors
 * (`correlateFindings` runs once per side), then concatenated — a code
 * finding and a web finding describing the same underlying endpoint are
 * never merged into a single entry, because `computeFingerprint` bakes
 * the detector `source` into the hash by design (Section on fingerprint
 * stability), so a `rules_engine` fingerprint and a `web_security`
 * fingerprint for the same route can never collide. True cross-layer
 * correlation (recognizing "`SENTINEL-AUTHZ-001` on `GET /users/{id}`"
 * and "missing auth header observed on `GET /users/42`" as evidence for
 * the same issue) would need to key on the *route*, via
 * `routeCorrelation`, not the finding fingerprint — that linkage is
 * surfaced in `routeCorrelation.matched` for a human (or a future
 * correlation pass) to use, not automated here.
 *
 * **Known inefficiency, documented rather than hidden**: this clones and
 * walks the repository a second time (once inside `runScanPipeline`,
 * once here to extract source routes) because `runScanPipeline`'s
 * existing return type doesn't expose the workspace directory, and
 * changing that contract would touch every existing caller/test of a
 * function that already works. `cloneRepository`/`walkRepositoryFiles`
 * are injected dependencies, so this only means a repeated real clone in
 * production, not a repeated network call in every test.
 */
export async function runFullStackScanPipeline(
  input: FullStackScanInput,
  deps: FullStackScanDependencies,
): Promise<FullStackScanResult> {
  const startedAt = Date.now();
  const now = deps.now ?? new Date();

  const codeResult = await runScanPipeline(input.code, deps);

  const clone = await deps.cloneRepository({
    repositoryUrl: input.code.repositoryUrl,
    commitSha: input.code.commitSha,
    branch: input.code.branch,
    destinationDir: input.code.workspaceDir,
  });
  const walked = await deps.walkRepositoryFiles(clone.destinationDir);
  const sourceRoutes = extractSourceRoutes(
    clone.destinationDir,
    walked.files.map((f) => f.relativePath),
  );

  let web: FullStackScanResult["web"];
  let routeCorrelation: RouteCorrelationResult | undefined;
  let webCorrelatedFindings: CorrelatedFinding[] = [];

  if (input.webTarget) {
    const createCrawler =
      deps.createCrawler ?? ((client, options) => new BoundedCrawler(client, options));
    const scanUrlFn = deps.scanUrl ?? defaultScanUrl;

    const client = new SafeHttpClient(input.webTarget.scopeGuard);
    const crawler = createCrawler(client, input.webTarget.crawlOptions);
    const crawl = await crawler.crawl(input.webTarget.baseUrl);

    const findings = [];
    for (const page of crawl.pages) {
      const result = await scanUrlFn(page.url, input.webTarget.scopeGuard);
      findings.push(...result.findings);
    }

    web = { crawl, findings };
    routeCorrelation = correlateRoutes(sourceRoutes, crawl);
    webCorrelatedFindings = correlateFindings(findings.map(webFindingToDraft));
  } else if (sourceRoutes.length > 0) {
    routeCorrelation = {
      sourceRoutes,
      runtimeRequestCount: 0,
      matched: [],
      unmatchedRuntimeRequests: [],
      unmatchedSourceRoutes: sourceRoutes,
    };
  }

  const correlatedFindings = [...codeResult.correlatedFindings, ...webCorrelatedFindings];
  const securityScore = computeSecurityScore(
    correlatedFindings.map((f) => ({
      severity: f.severity,
      confidence: f.confidence,
      status: "open" as const,
      firstSeenAt: now,
    })),
    now,
  );

  return {
    code: codeResult,
    web,
    routeCorrelation,
    correlatedFindings,
    securityScore,
    durationMs: Date.now() - startedAt,
  };
}

function extractSourceRoutes(rootDir: string, filePaths: string[]): NormalizedRoute[] {
  const { sourceFiles } = loadProjectFromDirectory(rootDir, filePaths);
  const routes: NormalizedRoute[] = [];

  for (const sourceFile of sourceFiles) {
    const relativePath = toRelativePath(sourceFile, rootDir);
    for (const handler of extractRouteHandlers(sourceFile, relativePath)) {
      routes.push({
        method: handler.httpMethod,
        pattern: handler.path,
        origin: "source",
        metadata: { filePath: relativePath, line: handler.line, framework: handler.framework },
      });
    }
  }

  return routes;
}

function correlateRoutes(
  sourceRoutes: NormalizedRoute[],
  crawl: CrawlResult,
): RouteCorrelationResult {
  const matched: RouteCorrelationResult["matched"] = [];
  const unmatchedRuntimeRequests: RouteCorrelationResult["unmatchedRuntimeRequests"] = [];
  const matchedSourceRoutes = new Set<NormalizedRoute>();

  for (const page of crawl.pages) {
    const path = new URL(page.url).pathname;
    const result = correlateRuntimeRequest("GET", path, sourceRoutes);
    if (result.match) {
      matched.push({
        runtimeMethod: "GET",
        runtimePath: path,
        sourceRoute: result.match.route,
        params: result.match.params,
      });
      matchedSourceRoutes.add(result.match.route);
    } else {
      unmatchedRuntimeRequests.push({ method: "GET", path });
    }
  }

  return {
    sourceRoutes,
    runtimeRequestCount: crawl.pages.length,
    matched,
    unmatchedRuntimeRequests,
    unmatchedSourceRoutes: sourceRoutes.filter((r) => !matchedSourceRoutes.has(r)),
  };
}
