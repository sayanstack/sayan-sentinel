import { createTaintSinkRule } from "../generic-taint-rule";

/**
 * Flags untrusted input reaching React's `dangerouslySetInnerHTML` without
 * an HTML-escaping transform. Ordinary React text interpolation
 * (`<div>{value}</div>`) is never flagged — React escapes it automatically
 * and it isn't in the sink catalog at all; only the explicit
 * `dangerouslySetInnerHTML={{ __html: ... }}` escape hatch is a sink.
 */
export const injXss = createTaintSinkRule({
  id: "SENTINEL-INJ-003",
  title: "Cross-Site Scripting (XSS) via dangerouslySetInnerHTML",
  description:
    "Untrusted input reaches `dangerouslySetInnerHTML` without an HTML-escaping/sanitizing transform, allowing an " +
    "attacker to inject markup or script that executes in another user's browser.",
  category: "injection",
  severity: "high",
  cwe: "CWE-79",
  owasp: ["A03:2021 – Injection"],
  supportedFrameworks: ["nextjs"],
  remediation:
    "Avoid `dangerouslySetInnerHTML` for untrusted input. If raw HTML rendering is required, sanitize it first with " +
    "a library such as DOMPurify (`DOMPurify.sanitize(value)`) rather than passing the value through unescaped.",
  sinkCategory: "html_output",
  findingTitle: "Potential Cross-Site Scripting (XSS)",
  buildReason: (flow, leaf) =>
    `Detected: untrusted input from ${leaf.binding.origin.source.description} reaches dangerouslySetInnerHTML with no ` +
    `HTML-escaping/sanitizing transform observed.`,
});
