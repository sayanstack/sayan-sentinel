import { normalizeHost } from "../targets/normalize-host";

export interface ParsedScopeTarget {
  scheme: "http" | "https";
  host: string;
  port: number;
}

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Turns one HackerOne structured-scope entry into the scheme/host/port
 * shape `TargetAuthorization` needs — or `null` for an asset type Sentinel
 * has no scanning primitive for (mobile apps, source code, hardware,
 * social-media handles, smart contracts, ...). Only `URL`/`DOMAIN`/
 * `WILDCARD` are recognized today; see `hackerone-client.ts`'s doc comment
 * for why that list isn't guaranteed complete or exactly right against a
 * real account — an unrecognized type is reported back to the caller as
 * skipped, never silently coerced into something that might scan the
 * wrong thing.
 */
export function parseScopeAsset(assetType: string, identifier: string): ParsedScopeTarget | null {
  const type = assetType.trim().toUpperCase();
  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier) return null;

  if (type === "WILDCARD" || type === "DOMAIN") {
    // "*.example.com" -> "example.com"; a bare "example.com" is used as-is.
    const withoutWildcard = trimmedIdentifier.replace(/^\*\.?/, "");
    const host = normalizeHost(withoutWildcard);
    if (!host) return null;
    return { scheme: "https", host, port: 443 };
  }

  if (type === "URL") {
    const withScheme = SCHEME_PATTERN.test(trimmedIdentifier)
      ? trimmedIdentifier
      : `https://${trimmedIdentifier}`;

    let parsed: URL;
    try {
      parsed = new URL(withScheme);
    } catch {
      return null;
    }

    const host = normalizeHost(parsed.hostname);
    if (!host) return null;

    const scheme = parsed.protocol === "http:" ? "http" : "https";
    const port = parsed.port ? Number(parsed.port) : scheme === "http" ? 80 : 443;
    return { scheme, host, port };
  }

  return null;
}
