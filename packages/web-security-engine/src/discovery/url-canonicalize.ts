const STATIC_ASSET_EXTENSIONS = new Set([
  ".css",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
  ".pdf",
  ".zip",
]);

/**
 * Resolves a possibly-relative URL against the page it was found on and
 * strips the fragment (`#section` never reaches the server, so it's
 * meaningless for discovery/dedup purposes). Returns `undefined` for
 * anything that isn't a resolvable `http(s)` URL — `mailto:`, `tel:`,
 * `javascript:`, a bare `#anchor`, or a malformed reference.
 */
export function canonicalizeUrl(rawUrl: string, baseUrl: string): string | undefined {
  try {
    const resolved = new URL(rawUrl, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return undefined;
  }
}

export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Whether a path looks like a static asset that discovery should skip by default — a stylesheet or image is never itself a security-relevant endpoint to crawl into. */
export function isStaticAssetPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex === -1) return false;
  return STATIC_ASSET_EXTENSIONS.has(lower.slice(dotIndex));
}
