/**
 * IPv4/IPv6 ranges that must never be reachable from dynamic validation
 * unless LOCAL_LAB_MODE is explicitly enabled — private networks, loopback,
 * link-local (which includes the 169.254.169.254 cloud metadata endpoint),
 * and a handful of other reserved ranges. Deliberately dependency-free: a
 * small, fully-tested CIDR matcher rather than pulling in an IP-range
 * library for something this security-critical.
 */
const BLOCKED_IPV4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10", // carrier-grade NAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local -- includes 169.254.169.254 cloud metadata
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24", // TEST-NET-1
  "192.168.0.0/16",
  "198.18.0.0/15", // benchmarking
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Not a valid IPv4 address: ${ip}`);
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function isIPv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range!) & mask);
}

export function isBlockedIPv4(ip: string): boolean {
  try {
    return BLOCKED_IPV4_CIDRS.some((cidr) => isIPv4InCidr(ip, cidr));
  } catch {
    // Not a parseable IPv4 address — fail closed by treating it as blocked
    // rather than silently letting an unparseable input through.
    return true;
  }
}

/**
 * IPv6 coverage is intentionally narrower than IPv4: exact loopback
 * (::1), link-local (fe80::/10), unique local (fc00::/7), and IPv4-mapped
 * addresses (re-checked against the IPv4 list). Full general-purpose IPv6
 * CIDR arithmetic is out of scope for this pass — documented here rather
 * than silently incomplete.
 */
export function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

  const mappedMatch = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(normalized);
  if (mappedMatch?.[1]) {
    return isBlockedIPv4(mappedMatch[1]);
  }

  const firstSegment = normalized.split(":")[0] ?? "";
  const firstHextet = firstSegment ? parseInt(firstSegment, 16) : NaN;
  if (Number.isNaN(firstHextet)) return false;

  // fe80::/10 link-local: first hextet in [0xfe80, 0xfebf]
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true;
  // fc00::/7 unique local: first hextet in [0xfc00, 0xfdff]
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true;

  return false;
}

export function isBlockedAddress(address: string, ipVersion: 4 | 6): boolean {
  return ipVersion === 4 ? isBlockedIPv4(address) : isBlockedIPv6(address);
}
