import type { SafeHttpResponse } from "../http/types";
import type { WebFinding } from "./types";

interface ParsedCookie {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
}

const SENSITIVE_COOKIE_NAME = /session|auth|token|jwt|sid|login|credential/i;

function parseSetCookie(header: string): ParsedCookie {
  const parts = header.split(";").map((p) => p.trim());
  const name = parts[0]?.split("=")[0]?.trim() ?? "";
  const lowerAttrs = parts.slice(1).map((p) => p.toLowerCase());
  const sameSiteAttr = lowerAttrs.find((a) => a.startsWith("samesite"));
  return {
    name,
    secure: lowerAttrs.includes("secure"),
    httpOnly: lowerAttrs.includes("httponly"),
    sameSite: sameSiteAttr?.split("=")[1]?.trim(),
  };
}

/**
 * SENTINEL-WEB-002 (missing Secure) / SENTINEL-WEB-003 (missing HttpOnly):
 * checks every `Set-Cookie` header on an HTTPS response. Severity is
 * conservative and name-based — a cookie whose name looks like a session/
 * auth token missing `HttpOnly` (readable by any script, including an XSS
 * payload) or `Secure` (sendable over plain HTTP) is reported at a real
 * severity; an ordinary preference cookie (`theme`, `locale`, ...) missing
 * the same attribute is reported at `info`, not inflated to match.
 */
export function analyzeCookies(response: SafeHttpResponse): WebFinding[] {
  const findings: WebFinding[] = [];
  const isHttps = response.url.startsWith("https://");

  for (const header of response.setCookieHeaders) {
    const cookie = parseSetCookie(header);
    if (!cookie.name) continue;
    const sensitive = SENSITIVE_COOKIE_NAME.test(cookie.name);

    if (isHttps && !cookie.secure) {
      findings.push({
        ruleId: "SENTINEL-WEB-002",
        title: "Cookie Missing Secure Attribute",
        description: `Cookie "${cookie.name}" is set over HTTPS without the Secure attribute, so it could still be sent over a plain HTTP connection to the same host.`,
        severity: sensitive ? "medium" : "low",
        confidence: "high",
        reason: `Detected: Set-Cookie for "${cookie.name}" has no Secure attribute.`,
        evidence: [
          { label: "Cookie name", detail: cookie.name },
          { label: "Set-Cookie header", detail: header },
        ],
        remediation: `Add the Secure attribute to the "${cookie.name}" cookie.`,
      });
    }

    if (!cookie.httpOnly) {
      findings.push({
        ruleId: "SENTINEL-WEB-003",
        title: "Cookie Missing HttpOnly Attribute",
        description: `Cookie "${cookie.name}" has no HttpOnly attribute, so any script running on the page (including an XSS payload) can read it.`,
        severity: sensitive ? "medium" : "info",
        confidence: "high",
        reason: `Detected: Set-Cookie for "${cookie.name}" has no HttpOnly attribute.`,
        evidence: [
          { label: "Cookie name", detail: cookie.name },
          { label: "Set-Cookie header", detail: header },
        ],
        remediation: `Add the HttpOnly attribute to the "${cookie.name}" cookie unless client-side script genuinely needs to read it.`,
      });
    }
  }

  return findings;
}
