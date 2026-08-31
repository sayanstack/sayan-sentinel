import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CodeGraph } from "@sayan-sentinel/code-intelligence";
import type {
  CrawlResult,
  WebFinding,
  WebSecurityScanResult,
} from "@sayan-sentinel/web-security-engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runFullStackScanPipeline } from "./run-full-stack-scan-pipeline";
import type { FullStackScanDependencies, FullStackScanInput } from "./full-stack-scan-types";

const EMPTY_GRAPH: CodeGraph = { nodes: [], edges: [] };

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-full-stack-scan-"));
  fs.writeFileSync(
    path.join(workspaceDir, "handler.ts"),
    [
      'import { Router } from "express";',
      "const router = Router();",
      'router.get("/api/accounts/:accountId", (req, res) => { res.json({ ok: true }); });',
      "export default router;",
    ].join("\n"),
  );
});

afterEach(() => {
  fs.rmSync(workspaceDir, { recursive: true, force: true, maxRetries: 3 });
});

function baseCodeInput(): FullStackScanInput["code"] {
  return {
    repositoryUrl: "https://example.invalid/repo.git",
    commitSha: "abc123",
    workspaceDir,
    scanId: "scan-1",
    localLabMode: false,
  };
}

function baseDeps(overrides: Partial<FullStackScanDependencies> = {}): FullStackScanDependencies {
  return {
    cloneRepository: async ({ destinationDir, commitSha }) => ({ destinationDir, commitSha }),
    walkRepositoryFiles: async () => ({ files: [{ relativePath: "handler.ts" }] }),
    buildCodeGraph: () => EMPTY_GRAPH,
    scanners: [],
    aiProvider: null,
    policyRules: [],
    now: new Date("2026-08-31T00:00:00Z"),
    ...overrides,
  };
}

describe("runFullStackScanPipeline (code-only, no web target)", () => {
  it("extracts source routes and marks every one unmatched when there is no web target", async () => {
    const result = await runFullStackScanPipeline({ code: baseCodeInput() }, baseDeps());

    expect(result.web).toBeUndefined();
    expect(result.routeCorrelation?.sourceRoutes).toHaveLength(1);
    expect(result.routeCorrelation?.sourceRoutes[0]).toMatchObject({
      method: "GET",
      pattern: "/api/accounts/{accountId}",
    });
    expect(result.routeCorrelation?.matched).toHaveLength(0);
    expect(result.routeCorrelation?.unmatchedSourceRoutes).toHaveLength(1);
  });

  it("produces a perfect score with no scanners and no web target", async () => {
    const result = await runFullStackScanPipeline({ code: baseCodeInput() }, baseDeps());
    expect(result.securityScore.score).toBe(100);
    expect(result.correlatedFindings).toEqual([]);
  });
});

describe("runFullStackScanPipeline (with a web target)", () => {
  function fakeCrawlResult(): CrawlResult {
    return {
      startUrl: "https://target.example.com/",
      pages: [
        {
          url: "https://target.example.com/api/accounts/42",
          depth: 0,
          status: 200,
          links: [],
          scripts: [],
          forms: [],
        },
        {
          url: "https://target.example.com/unmapped",
          depth: 0,
          status: 200,
          links: [],
          scripts: [],
          forms: [],
        },
      ],
      visitedCount: 2,
      skippedExternal: [],
      truncated: false,
      errors: [],
    };
  }

  function webFinding(url: string): WebFinding {
    return {
      ruleId: "SENTINEL-WEB-006",
      title: "Missing Transport Security Policy",
      description: "desc",
      severity: "low",
      confidence: "high",
      reason: "Detected: no HSTS header.",
      url,
      evidence: [{ label: "URL", detail: url }],
      remediation: "Add Strict-Transport-Security.",
    };
  }

  it("merges web findings into the unified result and correlates runtime paths against source routes", async () => {
    const crawlResult = fakeCrawlResult();
    const deps = baseDeps({
      createCrawler: () => ({ crawl: async () => crawlResult }),
      scanUrl: async (url): Promise<WebSecurityScanResult> => ({
        url,
        findings: [webFinding(url)],
      }),
    });

    const input: FullStackScanInput = {
      code: baseCodeInput(),
      webTarget: {
        baseUrl: "https://target.example.com/",
        scopeGuard: {
          authorizations: [
            {
              id: "auth-1",
              scheme: "https",
              host: "target.example.com",
              port: 443,
              allowedPathPrefixes: [],
              maxTier: 0,
              expiresAt: new Date("2026-12-31T00:00:00Z"),
              verifiedAt: new Date("2026-08-01T00:00:00Z"),
              revokedAt: null,
            },
          ],
          tier: 0,
        },
      },
    };

    const result = await runFullStackScanPipeline(input, deps);

    expect(result.web?.findings).toHaveLength(2); // one per crawled page
    expect(result.correlatedFindings.length).toBeGreaterThan(0);
    expect(result.correlatedFindings.every((f) => f.primarySource === "web_security")).toBe(true);

    expect(result.routeCorrelation?.matched).toHaveLength(1);
    expect(result.routeCorrelation?.matched[0]).toMatchObject({
      runtimePath: "/api/accounts/42",
      params: { accountId: "42" },
    });
    expect(result.routeCorrelation?.unmatchedRuntimeRequests).toEqual([
      { method: "GET", path: "/unmapped" },
    ]);
    expect(result.routeCorrelation?.unmatchedSourceRoutes).toHaveLength(0);
  });

  it("recomputes the security score over the combined code + web findings", async () => {
    const crawlResult = fakeCrawlResult();
    const deps = baseDeps({
      createCrawler: () => ({ crawl: async () => crawlResult }),
      scanUrl: async (url): Promise<WebSecurityScanResult> => ({
        url,
        findings: [webFinding(url)],
      }),
    });

    const result = await runFullStackScanPipeline(
      {
        code: baseCodeInput(),
        webTarget: {
          baseUrl: "https://target.example.com/",
          scopeGuard: {
            authorizations: [
              {
                id: "auth-1",
                scheme: "https",
                host: "target.example.com",
                port: 443,
                allowedPathPrefixes: [],
                maxTier: 0,
                expiresAt: new Date("2026-12-31T00:00:00Z"),
                verifiedAt: new Date("2026-08-01T00:00:00Z"),
                revokedAt: null,
              },
            ],
            tier: 0,
          },
        },
      },
      deps,
    );

    // Two low-severity findings should pull the score below a perfect 100, but not devastate it.
    expect(result.securityScore.score).toBeLessThan(100);
  });
});
