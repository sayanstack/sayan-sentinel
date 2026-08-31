import type { SafeHttpResponse } from "../http/types";
import type { WebFinding } from "./types";

const DEBUG_MARKERS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /at\s+[\w.<>[\] ]+\s+\([^)]*:\d+:\d+\)/, label: "Node.js stack trace" },
  { pattern: /Traceback \(most recent call last\)/, label: "Python traceback" },
  { pattern: /Whoops[\s\S]{0,200}Laravel|Illuminate\\Database/i, label: "Laravel debug page" },
  { pattern: /Server Error in '\/' Application/, label: "ASP.NET debug page" },
  { pattern: /Django Version:[\s\S]{0,500}Exception Type:/, label: "Django debug page" },
  { pattern: /PHP Fatal error|PHP Warning:.*on line \d+/, label: "PHP error output" },
  { pattern: /at System\.\S+\.\S+\(/, label: ".NET stack trace" },
];

/**
 * SENTINEL-WEB-004: scans a response body for known framework debug-page
 * and stack-trace signatures. Only fires on genuinely recognizable
 * signatures (a full framework debug page or a language-specific stack
 * trace shape), not on any mention of the word "error" — that would be far
 * too noisy to be useful. Severity is higher on an actual error-status
 * response (5xx/4xx), since a debug page appearing on a 200 is a stranger
 * and arguably more concerning signal but harder to distinguish from
 * intentional example content without more context.
 */
export function analyzeDebugExposure(response: SafeHttpResponse): WebFinding[] {
  const findings: WebFinding[] = [];

  for (const { pattern, label } of DEBUG_MARKERS) {
    const match = pattern.exec(response.body);
    if (!match) continue;

    const isErrorStatus = response.status >= 400;
    findings.push({
      ruleId: "SENTINEL-WEB-004",
      title: "Debug Information Exposure",
      description: `The response body contains a ${label} signature, which can reveal internal file paths, framework/library versions, and application internals to any caller.`,
      severity: isErrorStatus ? "medium" : "low",
      confidence: "medium",
      reason: `Detected: response body matches a ${label} signature on an HTTP ${response.status} response.`,
      url: response.url,
      evidence: [
        { label: "Signature", detail: label },
        { label: "HTTP status", detail: String(response.status) },
        { label: "Matched text", detail: match[0].slice(0, 200) },
      ],
      remediation:
        "Disable framework debug/development mode in production and return a generic error page or JSON error object instead of the raw exception.",
    });
  }

  return findings;
}
