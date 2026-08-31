import type { SafeHttpResponse } from "../http/types";
import type { WebFinding } from "./types";

/**
 * SENTINEL-WEB-006: an HTTPS response with no Strict-Transport-Security
 * header. Always `low` severity — missing HSTS is a defense-in-depth gap
 * (a user who's never visited the site is still vulnerable to an SSL-strip
 * downgrade on their first request even with HSTS present), not a directly
 * exploitable vulnerability on its own, and severity discipline means this
 * never gets inflated to look more urgent than a confirmed access-control
 * bypass.
 */
export function analyzeTransportSecurity(response: SafeHttpResponse): WebFinding[] {
  if (!response.url.startsWith("https://")) return [];
  if (response.headers["strict-transport-security"]) return [];

  return [
    {
      ruleId: "SENTINEL-WEB-006",
      title: "Missing Transport Security Policy",
      description:
        "The HTTPS response has no Strict-Transport-Security header, so a browser that reaches this " +
        "site over plain HTTP (e.g. a user typing the bare domain) isn't told to upgrade future " +
        "requests automatically.",
      severity: "low",
      confidence: "high",
      reason: "Detected: no Strict-Transport-Security header on an HTTPS response.",
      evidence: [{ label: "URL", detail: response.url }],
      remediation:
        "Add a `Strict-Transport-Security: max-age=31536000; includeSubDomains` response header (adjust `max-age` and `includeSubDomains` to your deployment).",
    },
  ];
}
