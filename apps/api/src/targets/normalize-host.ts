/**
 * Turns whatever a user pastes into a single "just the domain" input box —
 * `https://APP.Example.com/dashboard?x=1`, `example.com/`, `example.com` —
 * into the bare, lowercase hostname `TargetAuthorization.host` expects.
 * Never throws: an unparseable input returns `null` so the caller can
 * surface a clean validation error instead of a stack trace.
 */
export function normalizeHost(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let hostname: string;
  try {
    hostname = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }

  hostname = hostname.replace(/\.$/, "");
  if (!hostname || hostname.length > 253) return null;

  // A bare IP has no zone to publish a DNS TXT verification record under.
  const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
  if (IPV4_PATTERN.test(hostname)) return null;

  const HOSTNAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
  if (!HOSTNAME_PATTERN.test(hostname)) return null;

  return hostname;
}
