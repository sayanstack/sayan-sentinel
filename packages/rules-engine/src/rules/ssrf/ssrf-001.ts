import { createTaintSinkRule } from "../generic-taint-rule";

/**
 * Flags untrusted input reaching an outbound HTTP request API
 * (`fetch`, `axios`, `http`/`https`). Sentinel cannot statically confirm the
 * absence of a protocol restriction or host allowlist elsewhere in the
 * request pipeline (e.g. an egress proxy) — this is reported as a
 * medium-confidence candidate, not a confirmed SSRF, since exploitability
 * from a string match alone is never claimed.
 */
export const ssrfOutboundRequest = createTaintSinkRule({
  id: "SENTINEL-SSRF-001",
  title: "Server-Side Request Forgery (SSRF)",
  description:
    "Untrusted input controls the destination of an outbound HTTP request, with no observable protocol restriction " +
    "or host allowlist, allowing an attacker to direct the server to make requests to internal or unintended hosts.",
  category: "ssrf",
  severity: "high",
  cwe: "CWE-918",
  owasp: ["A10:2021 – Server-Side Request Forgery"],
  remediation:
    "Validate the destination against an explicit host/scheme allowlist before making the request, and block " +
    "requests to private/link-local/loopback address ranges and cloud metadata endpoints at the network layer.",
  sinkCategory: "http_request",
  findingTitle: "Potential Server-Side Request Forgery (SSRF)",
  extraConfidenceSignals: () => [
    {
      label: "No observable host allowlist or protocol restriction at the call site",
      weight: 5,
      present: true,
    },
  ],
  buildReason: (flow, leaf) =>
    `Detected: untrusted input from ${leaf.binding.origin.source.description} reaches ${flow.sink.api}(...) with no ` +
    `observable host allowlist or protocol restriction.`,
});
