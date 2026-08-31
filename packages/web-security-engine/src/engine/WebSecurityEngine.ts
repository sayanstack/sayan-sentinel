import { SafeHttpClient } from "../http/SafeHttpClient";
import type { SafeHttpClientOptions } from "../http/types";
import { analyzeCookies } from "../analysis/cookies";
import { analyzeCors } from "../analysis/cors";
import { analyzeDebugExposure } from "../analysis/debug-exposure";
import { analyzeTransportSecurity } from "../analysis/transport-security";
import type { WebFinding } from "../analysis/types";

export interface WebSecurityScanResult {
  url: string;
  findings: WebFinding[];
  /** Set when the target couldn't be reached at all (Scope Guard denial, timeout, network error) — never silently treated as "no findings." */
  fetchError?: string;
}

/**
 * Runs every passive Web Security Engine rule against one URL through the
 * single `SafeHttpClient` instance they all share — every request these
 * rules make (the initial GET, the CORS probe) goes through the same
 * Scope-Guard-enforced, timeout-bounded, size-capped client. A target
 * Scope Guard denies, or that's unreachable, produces `fetchError`, never
 * a fabricated empty-but-successful result.
 */
export async function scanUrl(
  url: string,
  options: SafeHttpClientOptions,
): Promise<WebSecurityScanResult> {
  const client = new SafeHttpClient(options);
  const outcome = await client.request(url);
  if (!outcome.ok) {
    return { url, findings: [], fetchError: `${outcome.reason}: ${outcome.detail}` };
  }

  const findings: WebFinding[] = [
    ...(await analyzeCors(client, url)),
    ...analyzeCookies(outcome.response),
    ...analyzeDebugExposure(outcome.response),
    ...analyzeTransportSecurity(outcome.response),
  ];

  return { url, findings };
}
