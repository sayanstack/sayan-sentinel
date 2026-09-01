import type { SafetyTier, TargetAuthorizationRecord } from "@sayan-sentinel/security-core";
import type { DnsResolver } from "@sayan-sentinel/security-core";

export interface SafeHttpResponse {
  /** The final URL after following any redirects. */
  url: string;
  status: number;
  headers: Record<string, string>;
  /**
   * Every `Set-Cookie` header value, kept separate from `headers` because a
   * response can carry more than one and their values can't be safely
   * comma-joined (an `Expires=Wed, 21 Oct ...` attribute contains a comma
   * itself) the way ordinary multi-value headers can.
   */
  setCookieHeaders: string[];
  body: string;
  /** True when the body was cut off at `maxResponseBytes` before the response finished. */
  truncated: boolean;
  /** Every URL visited before the final one, in order, for audit/evidence purposes. */
  redirectChain: string[];
}

export type SafeHttpFailureReason =
  "scope_denied" | "method_not_allowed" | "too_many_redirects" | "timeout" | "network_error";

export type SafeHttpOutcome =
  | { ok: true; response: SafeHttpResponse }
  | { ok: false; reason: SafeHttpFailureReason; detail: string };

export interface FetchResponseLike {
  status: number;
  /**
   * Always a plain record, lowercase keys — never a `Headers` instance.
   * The default `fetchImpl` (real `fetch`) converts `Response.headers` to
   * this shape at the boundary, so every consumer downstream (rules,
   * `normalizeHeaders`) deals with exactly one representation regardless
   * of whether the response came from real `fetch` or a test fake.
   */
  headers: Record<string, string>;
  /** All `Set-Cookie` values — see the note on `SafeHttpResponse.setCookieHeaders`. Defaults to `[]` for a fake that doesn't set any cookies. */
  setCookieHeaders?: string[];
  /** Preferred: a real streaming body, so `maxResponseBytes` is enforced during transfer, not after it. */
  body?: AsyncIterable<Uint8Array> | null;
  /** Fallback for test fakes that don't model streaming — read whole, then truncated to the byte cap. */
  text?(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers?: Record<string, string>; signal: AbortSignal },
) => Promise<FetchResponseLike>;

export interface SafeHttpClientOptions {
  authorizations: TargetAuthorizationRecord[];
  tier: SafetyTier;
  localLabMode?: boolean;
  /** Default 5 — bounded so a redirect loop can't hang a scan indefinitely. */
  maxRedirects?: number;
  /** Default 2 MiB. */
  maxResponseBytes?: number;
  /** Default 10s. */
  timeoutMs?: number;
  /** Default `["GET", "HEAD"]` — passive analysis never needs more; a rule that thinks it needs POST is out of scope for this client. */
  allowedMethods?: string[];
  /** Injectable for tests; forwarded to `evaluateScopeGuard`. */
  resolver?: DnsResolver;
  /** Injectable for tests; defaults to a real `fetch` with `redirect: "manual"` so every hop is re-checked. */
  fetchImpl?: FetchLike;
  now?: Date;
  onAudit?: (event: SafeHttpAuditEvent) => void;
}

export type SafeHttpAuditEvent =
  | { type: "scope_check"; url: string; allowed: boolean; reason: string }
  | { type: "request"; url: string; method: string }
  | { type: "redirect"; from: string; to: string };
