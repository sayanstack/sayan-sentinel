import type { SafeHttpClient } from "../http/SafeHttpClient";
import type { WebFinding } from "./types";

const PROBE_ORIGIN = "https://sentinel-cors-probe.invalid";

/**
 * SENTINEL-WEB-001: sends a request with an `Origin` header the target has
 * never legitimately seen (a probe value under a domain that will never
 * resolve), then checks whether the response's CORS headers reflect it
 * back. Reflecting an arbitrary origin combined with
 * `Access-Control-Allow-Credentials: true` means any website can read
 * authenticated responses on behalf of a logged-in victim — this is the
 * one CORS misconfiguration that's unambiguously dangerous. A bare
 * `Access-Control-Allow-Origin: *` with no credentials is reported at
 * `info` severity (often intentional for a public API), never inflated to
 * match the reflection case.
 */
export async function analyzeCors(
  client: SafeHttpClient,
  targetUrl: string,
): Promise<WebFinding[]> {
  const outcome = await client.request(targetUrl, { headers: { Origin: PROBE_ORIGIN } });
  if (!outcome.ok) return [];

  const acao = outcome.response.headers["access-control-allow-origin"];
  if (!acao) return [];
  const acac = outcome.response.headers["access-control-allow-credentials"];
  const credentialsEnabled = acac?.toLowerCase() === "true";
  const reflectsArbitraryOrigin = acao === PROBE_ORIGIN;
  const wildcard = acao === "*";

  const evidence = [
    { label: "Probe Origin sent", detail: PROBE_ORIGIN },
    { label: "Access-Control-Allow-Origin", detail: acao },
    { label: "Access-Control-Allow-Credentials", detail: acac ?? "(not present)" },
  ];

  if (reflectsArbitraryOrigin && credentialsEnabled) {
    return [
      {
        ruleId: "SENTINEL-WEB-001",
        title: "Risky CORS Configuration: Arbitrary Origin Reflection With Credentials",
        description:
          "The server reflects an Origin header it has never seen before verbatim in " +
          "Access-Control-Allow-Origin, with Access-Control-Allow-Credentials: true. Any website " +
          "can make an authenticated cross-origin request on behalf of a logged-in victim and read " +
          "the response.",
        severity: "high",
        confidence: "high",
        reason: `Detected: Access-Control-Allow-Origin reflected the probe origin "${PROBE_ORIGIN}" verbatim, with credentials enabled.`,
        evidence,
        remediation:
          "Validate the Origin header against an explicit allowlist of trusted origins instead of " +
          "reflecting any value, or disable credentialed CORS if it isn't required.",
      },
    ];
  }

  if (wildcard && credentialsEnabled) {
    return [
      {
        ruleId: "SENTINEL-WEB-001",
        title: "Risky CORS Configuration: Wildcard Origin With Credentials",
        description:
          "The server sends Access-Control-Allow-Origin: * together with " +
          "Access-Control-Allow-Credentials: true. Browsers reject this specific combination, but a " +
          "server configured this way is one edge case away from a real credential-reflection bug " +
          "and should not rely on browser enforcement alone.",
        severity: "medium",
        confidence: "high",
        reason: "Detected: wildcard Access-Control-Allow-Origin combined with credentials enabled.",
        evidence,
        remediation:
          "Use an explicit origin allowlist, never a wildcard, whenever credentials are enabled.",
      },
    ];
  }

  if (wildcard) {
    return [
      {
        ruleId: "SENTINEL-WEB-001",
        title: "Wildcard CORS Origin",
        description:
          'Access-Control-Allow-Origin is "*" with no credentials enabled — commonly intentional ' +
          "for a public API, but worth confirming this endpoint is meant to be readable cross-origin " +
          "by any website.",
        severity: "info",
        confidence: "high",
        reason: 'Detected: Access-Control-Allow-Origin is "*", no credentials enabled.',
        evidence,
        remediation:
          "Confirm this endpoint is intended to be publicly accessible cross-origin; if not, restrict " +
          "Access-Control-Allow-Origin to an explicit allowlist.",
      },
    ];
  }

  return [];
}
