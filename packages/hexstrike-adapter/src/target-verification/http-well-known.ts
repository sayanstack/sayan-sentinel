import { resolveAndCheckHost, type DnsResolver } from "../scope-guard/resolve-and-check";
import { HTTP_WELL_KNOWN_PATH, type VerificationResult } from "./types";

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_LENGTH = 4096;

export interface VerifyHttpWellKnownOptions {
  localLabMode?: boolean;
  /** Injectable for tests; defaults to a network fetch with SSRF-safe defaults (no redirects). */
  fetchImpl?: FetchLike;
  /** Injectable for tests; forwarded to the same DNS-rebinding-safe resolver Scope Guard uses. */
  dnsResolver?: DnsResolver;
}

/**
 * Verifies domain ownership via an HTTP well-known challenge, the same
 * pattern ACME (Let's Encrypt) HTTP-01 validation uses: the owner serves
 * the exact challenge token as the full response body at
 * `/.well-known/sentinel-verification`. Before ever connecting, the target
 * is resolved and checked against the same private/loopback/link-local
 * blocklist Scope Guard uses for dynamic validation (Section 20) —
 * verification itself must not become an SSRF primitive against internal
 * infrastructure just because the target isn't authorized yet. Redirects
 * are never followed (`redirect: "manual"` semantics via a fixed, literal
 * request URL) so verification can't be redirected to a different host
 * than the one actually being verified.
 */
export async function verifyHttpWellKnownChallenge(
  scheme: "http" | "https",
  host: string,
  port: number,
  challenge: string,
  options: VerifyHttpWellKnownOptions = {},
): Promise<VerificationResult> {
  const resolution = await resolveAndCheckHost(host, {
    localLabMode: options.localLabMode ?? false,
    resolver: options.dnsResolver,
  });
  if (resolution.blocked) {
    return {
      verified: false,
      method: "http_well_known",
      detail: `Refused to verify ${host}: ${resolution.reason}`,
    };
  }

  const portSuffix =
    (scheme === "https" && port === 443) || (scheme === "http" && port === 80) ? "" : `:${port}`;
  const url = `${scheme}://${host}${portSuffix}${HTTP_WELL_KNOWN_PATH}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? ((u, init) => fetch(u, { ...init, redirect: "manual" }));

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      return {
        verified: false,
        method: "http_well_known",
        detail: `${url} responded with HTTP ${response.status}`,
      };
    }

    const body = (await response.text()).trim();
    if (body.length > MAX_RESPONSE_LENGTH) {
      return {
        verified: false,
        method: "http_well_known",
        detail: `Response body from ${url} exceeded the ${MAX_RESPONSE_LENGTH}-byte verification limit`,
      };
    }

    const verified = body === challenge;
    return {
      verified,
      method: "http_well_known",
      detail: verified
        ? `${url} served the expected challenge value`
        : `${url} did not serve the expected challenge value`,
    };
  } catch (error) {
    return {
      verified: false,
      method: "http_well_known",
      detail: `Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
