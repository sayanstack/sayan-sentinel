import type { DnsResolver } from "./resolve-and-check";
import { resolveAndCheckHost } from "./resolve-and-check";
import type { SafetyTier, Scheme, ScopeDecision, TargetAuthorizationRecord } from "./types";

export interface EvaluateScopeGuardOptions {
  url: string;
  tier: SafetyTier;
  authorizations: TargetAuthorizationRecord[];
  localLabMode: boolean;
  now?: Date;
  /** Injectable for tests; defaults to real DNS resolution. */
  resolver?: DnsResolver;
}

function stripIPv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/**
 * The deterministic security boundary for every dynamic validation
 * request (Sections 19-20). This function is the ONLY thing that decides
 * whether a target may be reached — it has no dependency on, and cannot
 * be influenced by, anything the AI engine produced. Every check below
 * fails closed: an unmatched, ambiguous, or unresolvable case is always
 * `allowed: false`.
 *
 * To defend against "redirect escape" (Section 20), whoever executes the
 * actual HTTP request must call this function again on every redirect
 * Location header before following it, and abort if it comes back
 * disallowed — a single check against the original URL is not sufficient.
 */
export async function evaluateScopeGuard(
  options: EvaluateScopeGuardOptions,
): Promise<ScopeDecision> {
  const now = options.now ?? new Date();

  let parsed: URL;
  try {
    parsed = new URL(options.url);
  } catch {
    return { allowed: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "unsupported_scheme", detail: parsed.protocol };
  }
  const scheme: Scheme = parsed.protocol === "https:" ? "https" : "http";
  // WHATWG URL.hostname keeps an IPv6 literal bracket-wrapped (`"[::1]"`, not
  // `"::1"`) — every hostname comparison and IP check below needs the bare
  // address, or an IPv6 literal silently skips the fast-path localhost check
  // (`"[::1]" !== "::1"`) and `net.isIP()` in resolveAndCheckHost fails to
  // recognize it as a literal, falling through to an unnecessary — and on
  // some resolvers, unpredictable — DNS lookup of the bracketed string.
  const hostname = stripIPv6Brackets(parsed.hostname.toLowerCase());
  const port = parsed.port ? Number(parsed.port) : scheme === "https" ? 443 : 80;

  if (
    !options.localLabMode &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
  ) {
    return { allowed: false, reason: "blocked_hostname", detail: hostname };
  }

  const matchedAuthorization = options.authorizations.find(
    (auth) => auth.scheme === scheme && auth.host.toLowerCase() === hostname && auth.port === port,
  );
  if (!matchedAuthorization) {
    return { allowed: false, reason: "no_matching_authorization" };
  }
  if (matchedAuthorization.revokedAt) {
    return {
      allowed: false,
      reason: "authorization_revoked",
      matchedAuthorizationId: matchedAuthorization.id,
    };
  }
  if (matchedAuthorization.expiresAt.getTime() <= now.getTime()) {
    return {
      allowed: false,
      reason: "authorization_expired",
      matchedAuthorizationId: matchedAuthorization.id,
    };
  }
  if (!matchedAuthorization.verifiedAt) {
    return {
      allowed: false,
      reason: "authorization_not_verified",
      matchedAuthorizationId: matchedAuthorization.id,
    };
  }
  if (options.tier > matchedAuthorization.maxTier) {
    return {
      allowed: false,
      reason: "tier_exceeds_authorization",
      detail: `requested tier ${options.tier} exceeds authorized max tier ${matchedAuthorization.maxTier}`,
      matchedAuthorizationId: matchedAuthorization.id,
    };
  }

  const pathAllowed =
    matchedAuthorization.allowedPathPrefixes.length === 0 ||
    matchedAuthorization.allowedPathPrefixes.some((prefix) => parsed.pathname.startsWith(prefix));
  if (!pathAllowed) {
    return {
      allowed: false,
      reason: "path_not_allowed",
      detail: parsed.pathname,
      matchedAuthorizationId: matchedAuthorization.id,
    };
  }

  const resolution = await resolveAndCheckHost(hostname, {
    localLabMode: options.localLabMode,
    resolver: options.resolver,
  });
  if (resolution.blocked) {
    return {
      allowed: false,
      reason: "host_resolves_to_blocked_address",
      detail: resolution.reason,
      matchedAuthorizationId: matchedAuthorization.id,
      resolvedAddresses: resolution.resolvedAddresses,
    };
  }

  return {
    allowed: true,
    reason: "ok",
    matchedAuthorizationId: matchedAuthorization.id,
    resolvedAddresses: resolution.resolvedAddresses,
  };
}
