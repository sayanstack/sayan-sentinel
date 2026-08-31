import { evaluateScopeGuard } from "@sayan-sentinel/hexstrike-adapter";
import type {
  FetchResponseLike,
  SafeHttpAuditEvent,
  SafeHttpClientOptions,
  SafeHttpOutcome,
  SafeHttpResponse,
} from "./types";

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ALLOWED_METHODS = ["GET", "HEAD"];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function headerValue(headers: Record<string, string>, name: string): string | null {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key]! : null;
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(headers)) result[key.toLowerCase()] = headers[key]!;
  return result;
}

async function readCappedBody(
  response: FetchResponseLike,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (response.body && typeof response.body[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    let total = 0;
    let truncated = false;
    for await (const chunk of response.body) {
      const buf = Buffer.from(chunk);
      if (total + buf.length > maxBytes) {
        chunks.push(buf.subarray(0, Math.max(0, maxBytes - total)));
        truncated = true;
        total = maxBytes;
        break;
      }
      chunks.push(buf);
      total += buf.length;
    }
    return { text: Buffer.concat(chunks).toString("utf-8"), truncated };
  }

  if (response.text) {
    const full = await response.text();
    const bytes = Buffer.byteLength(full, "utf-8");
    if (bytes <= maxBytes) return { text: full, truncated: false };
    return {
      text: Buffer.from(full, "utf-8").subarray(0, maxBytes).toString("utf-8"),
      truncated: true,
    };
  }

  return { text: "", truncated: false };
}

/**
 * Real-network default: calls the global `fetch`, never follows redirects
 * itself (`SafeHttpClient` re-checks Scope Guard and follows manually), and
 * converts the `Headers` instance to a plain lowercase-keyed record at this
 * one boundary so nothing downstream needs to know two response shapes exist.
 */
async function defaultFetchImpl(
  url: string,
  init: { method: string; headers?: Record<string, string>; signal: AbortSignal },
): Promise<FetchResponseLike> {
  const response = await fetch(url, {
    method: init.method,
    headers: init.headers,
    signal: init.signal,
    redirect: "manual",
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  // `getSetCookie()` is the WHATWG-standardized way to get each Set-Cookie
  // value separately (Node 18.14.1+ / undici) — `headers.get("set-cookie")`
  // alone would unsafely comma-join multiple cookies.
  const setCookieHeaders =
    typeof (response.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (response.headers as unknown as { getSetCookie(): string[] }).getSetCookie()
      : [];
  return {
    status: response.status,
    headers,
    setCookieHeaders,
    body: response.body ?? undefined,
    text: () => response.text(),
  };
}

/**
 * The single, centralized HTTP client every Web Security Engine rule must
 * use — no rule instantiates its own `fetch`/HTTP client. Every request,
 * including every redirect hop, is re-checked against Scope Guard before
 * it's made; a target that becomes disallowed mid-redirect-chain (the
 * "redirect escape" scenario `scope-guard.ts` documents) is refused rather
 * than followed. Enforces a method allowlist (passive analysis defaults to
 * GET/HEAD only), a bounded redirect count, a request timeout, and a
 * response-size cap enforced during transfer when the underlying response
 * exposes a streaming body.
 */
export class SafeHttpClient {
  constructor(private readonly options: SafeHttpClientOptions) {}

  async request(
    url: string,
    init: { method?: string; headers?: Record<string, string> } = {},
  ): Promise<SafeHttpOutcome> {
    const method = (init.method ?? "GET").toUpperCase();
    const allowedMethods = (this.options.allowedMethods ?? DEFAULT_ALLOWED_METHODS).map((m) =>
      m.toUpperCase(),
    );
    if (!allowedMethods.includes(method)) {
      return { ok: false, reason: "method_not_allowed", detail: method };
    }

    const maxRedirects = this.options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const maxResponseBytes = this.options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const fetchImpl = this.options.fetchImpl ?? defaultFetchImpl;

    let currentUrl = url;
    const redirectChain: string[] = [];

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const decision = await evaluateScopeGuard({
        url: currentUrl,
        tier: this.options.tier,
        authorizations: this.options.authorizations,
        localLabMode: this.options.localLabMode ?? false,
        resolver: this.options.resolver,
        now: this.options.now,
      });
      this.audit({
        type: "scope_check",
        url: currentUrl,
        allowed: decision.allowed,
        reason: decision.reason,
      });
      if (!decision.allowed) {
        return {
          ok: false,
          reason: "scope_denied",
          detail: `${decision.reason}${decision.detail ? `: ${decision.detail}` : ""}`,
        };
      }

      this.audit({ type: "request", url: currentUrl, method });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: FetchResponseLike;
      try {
        response = await fetchImpl(currentUrl, {
          method,
          headers: init.headers,
          signal: controller.signal,
        });
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        return {
          ok: false,
          reason: aborted ? "timeout" : "network_error",
          detail: error instanceof Error ? error.message : String(error),
        };
      } finally {
        clearTimeout(timeout);
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = headerValue(response.headers, "location");
        if (!location) {
          return {
            ok: false,
            reason: "network_error",
            detail: "redirect response had no Location header",
          };
        }
        const nextUrl = new URL(location, currentUrl).toString();
        this.audit({ type: "redirect", from: currentUrl, to: nextUrl });
        redirectChain.push(currentUrl);
        currentUrl = nextUrl;
        continue;
      }

      const body = await readCappedBody(response, maxResponseBytes);
      return {
        ok: true,
        response: {
          url: currentUrl,
          status: response.status,
          headers: normalizeHeaders(response.headers),
          setCookieHeaders: response.setCookieHeaders ?? [],
          body: body.text,
          truncated: body.truncated,
          redirectChain,
        } satisfies SafeHttpResponse,
      };
    }

    return {
      ok: false,
      reason: "too_many_redirects",
      detail: `exceeded ${maxRedirects} redirects`,
    };
  }

  private audit(event: SafeHttpAuditEvent): void {
    this.options.onAudit?.(event);
  }
}
