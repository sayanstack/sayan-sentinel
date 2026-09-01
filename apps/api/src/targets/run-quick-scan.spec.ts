import type { TargetAuthorization } from "@sayan-sentinel/database";
import { BoundedCrawler, scanUrl } from "@sayan-sentinel/web-security-engine";
import { runQuickScan } from "./run-quick-scan";

jest.mock("@sayan-sentinel/web-security-engine", () => ({
  SafeHttpClient: jest.fn().mockImplementation(() => ({})),
  BoundedCrawler: jest.fn(),
  scanUrl: jest.fn(),
}));

const mockCrawl = jest.fn();

function makeTarget(overrides: Partial<TargetAuthorization> = {}): TargetAuthorization {
  return {
    id: "target-1",
    organizationId: "org-1",
    repositoryId: null,
    scheme: "https",
    host: "example.com",
    port: 443,
    allowedPathPrefixes: [],
    verificationMethod: "DNS_TXT",
    verificationChallenge: null,
    verifiedAt: new Date(),
    authorizedByUserId: "user-1",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    rateLimitRps: 2,
    maxTier: 0,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as TargetAuthorization;
}

function reachableCrawl(url: string) {
  return {
    startUrl: url,
    pages: [{ url, depth: 0, status: 200, links: [], scripts: [], forms: [] }],
    visitedCount: 1,
    skippedExternal: [],
    truncated: false,
    errors: [],
  };
}

function unreachableCrawl(url: string, reason: string) {
  return {
    startUrl: url,
    pages: [],
    visitedCount: 1,
    skippedExternal: [],
    truncated: false,
    errors: [{ url, reason }],
  };
}

describe("runQuickScan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (BoundedCrawler as unknown as jest.Mock).mockImplementation(() => ({ crawl: mockCrawl }));
  });

  it("scans over https when it's reachable, without attempting an http fallback", async () => {
    mockCrawl.mockResolvedValue(reachableCrawl("https://example.com:443/"));
    (scanUrl as jest.Mock).mockResolvedValue({
      url: "https://example.com:443/",
      findings: [{ ruleId: "SENTINEL-WEB-001" }],
    });

    const result = await runQuickScan(makeTarget());

    expect(result.schemeUsed).toBe("https");
    expect(result.findings).toHaveLength(1);
    expect(mockCrawl).toHaveBeenCalledTimes(1);
  });

  it("falls back to http when https is completely unreachable", async () => {
    mockCrawl
      .mockResolvedValueOnce(unreachableCrawl("https://example.com:443/", "network_error: refused"))
      .mockResolvedValueOnce(reachableCrawl("http://example.com:80/"));
    (scanUrl as jest.Mock).mockResolvedValue({ url: "http://example.com:80/", findings: [] });

    const result = await runQuickScan(makeTarget());

    expect(mockCrawl).toHaveBeenCalledTimes(2);
    expect(result.schemeUsed).toBe("http");
    expect(result.fetchError).toBeUndefined();
  });

  it("reports the original https failure when both schemes are unreachable", async () => {
    mockCrawl
      .mockResolvedValueOnce(unreachableCrawl("https://example.com:443/", "network_error: refused"))
      .mockResolvedValueOnce(unreachableCrawl("http://example.com:80/", "network_error: refused"));

    const result = await runQuickScan(makeTarget());

    expect(mockCrawl).toHaveBeenCalledTimes(2);
    expect(result.schemeUsed).toBe("https");
    expect(result.fetchError).toBe("network_error: refused");
    expect(result.findings).toEqual([]);
  });

  it("never attempts a fallback for a target already configured for http", async () => {
    mockCrawl.mockResolvedValue(
      unreachableCrawl("http://example.com:80/", "network_error: refused"),
    );

    const result = await runQuickScan(makeTarget({ scheme: "http", port: 80 }));

    expect(mockCrawl).toHaveBeenCalledTimes(1);
    expect(result.schemeUsed).toBe("http");
    expect(result.fetchError).toBeDefined();
  });
});
