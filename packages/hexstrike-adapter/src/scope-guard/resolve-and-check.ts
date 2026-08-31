import * as dns from "node:dns/promises";
import * as net from "node:net";
import { isBlockedIPv4, isBlockedIPv6 } from "./ip-blocklist";

export type DnsResolver = (hostname: string) => Promise<string[]>;

async function defaultResolver(hostname: string): Promise<string[]> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.internal"]);

export interface ResolveAndCheckOptions {
  localLabMode: boolean;
  resolver?: DnsResolver;
}

export interface ResolvedAddressCheck {
  blocked: boolean;
  resolvedAddresses: string[];
  reason?: string;
}

/**
 * Resolves `hostname` and checks the *actual resolved address* against the
 * blocklist — never the hostname string alone. This is the specific
 * defense against DNS rebinding: an attacker-controlled domain could
 * resolve to a public IP when first checked and a private one moments
 * later. Always resolving fresh at check time closes that gap for the
 * check itself.
 *
 * IMPORTANT for whoever wires up the actual outbound HTTP request this
 * check gates: the connection MUST be made to the SAME address that was
 * just checked here (e.g. via a DNS-pinning HTTP agent), not re-resolved
 * a second time — otherwise the gap between this check and the real
 * connection is itself a rebinding window.
 */
export async function resolveAndCheckHost(
  hostname: string,
  options: ResolveAndCheckOptions,
): Promise<ResolvedAddressCheck> {
  const resolve = options.resolver ?? defaultResolver;
  const literalVersion = net.isIP(hostname);

  let addresses: string[];
  if (literalVersion !== 0) {
    addresses = [hostname];
  } else {
    try {
      addresses = await resolve(hostname);
    } catch (error) {
      return {
        blocked: true,
        resolvedAddresses: [],
        reason: `DNS resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (options.localLabMode) {
    return { blocked: false, resolvedAddresses: addresses };
  }

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return { blocked: true, resolvedAddresses: addresses, reason: `hostname "${hostname}" is blocked` };
  }

  for (const address of addresses) {
    const version = net.isIP(address);
    if (version === 4 && isBlockedIPv4(address)) {
      return { blocked: true, resolvedAddresses: addresses, reason: `resolved address ${address} is in a blocked range` };
    }
    if (version === 6 && isBlockedIPv6(address)) {
      return { blocked: true, resolvedAddresses: addresses, reason: `resolved address ${address} is in a blocked range` };
    }
    if (version === 0) {
      return { blocked: true, resolvedAddresses: addresses, reason: `unparseable resolved address: ${address}` };
    }
  }

  return { blocked: false, resolvedAddresses: addresses };
}
