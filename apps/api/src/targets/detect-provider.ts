import { promises as dns } from "node:dns";

export interface DnsResolverLike {
  resolveNs(host: string): Promise<string[]>;
  resolveCname(host: string): Promise<string[]>;
  resolve4(host: string): Promise<string[]>;
}

export interface ProviderDetection {
  host: string;
  /** False when every lookup came back empty — an unregistered or freshly-created domain, not necessarily an error. */
  resolvable: boolean;
  nameservers: string[];
  nameserverProvider: string | null;
  cname: string | null;
  hostingProvider: string | null;
  addresses: string[];
}

const defaultResolver: DnsResolverLike = {
  resolveNs: (host) => dns.resolveNs(host),
  resolveCname: (host) => dns.resolveCname(host),
  resolve4: (host) => dns.resolve4(host),
};

const NAMESERVER_SIGNATURES: Array<{ pattern: RegExp; provider: string }> = [
  { pattern: /\.cloudflare\.com$/i, provider: "Cloudflare" },
  { pattern: /\.awsdns-\d+\.(com|net|org|co\.uk)$/i, provider: "AWS Route 53" },
  { pattern: /\.domaincontrol\.com$/i, provider: "GoDaddy" },
  { pattern: /\.registrar-servers\.com$/i, provider: "Namecheap" },
  { pattern: /\.googledomains\.com$/i, provider: "Google Domains" },
  { pattern: /\.dnsimple\.com$/i, provider: "DNSimple" },
  { pattern: /\.digitalocean\.com$/i, provider: "DigitalOcean" },
  { pattern: /\.name\.com$/i, provider: "Name.com" },
  { pattern: /\.dynect\.net$/i, provider: "Oracle Dyn" },
  { pattern: /\.ultradns\.(net|com|org)$/i, provider: "UltraDNS" },
  { pattern: /\.vercel-dns\.com$/i, provider: "Vercel" },
  { pattern: /\.ns\.porkbun\.com$/i, provider: "Porkbun" },
  { pattern: /\.bluehost\.com$/i, provider: "Bluehost" },
  { pattern: /\.hostgator\.com$/i, provider: "HostGator" },
];

const CNAME_HOSTING_SIGNATURES: Array<{ pattern: RegExp; provider: string }> = [
  { pattern: /\.vercel-dns\.com$/i, provider: "Vercel" },
  { pattern: /(^|\.)netlify\.(app|com)$/i, provider: "Netlify" },
  { pattern: /\.github\.io$/i, provider: "GitHub Pages" },
  { pattern: /\.pages\.dev$/i, provider: "Cloudflare Pages" },
  { pattern: /\.herokudns\.com$/i, provider: "Heroku" },
  { pattern: /\.herokuapp\.com$/i, provider: "Heroku" },
  { pattern: /\.myshopify\.com$/i, provider: "Shopify" },
  { pattern: /\.onrender\.com$/i, provider: "Render" },
  { pattern: /\.up\.railway\.app$/i, provider: "Railway" },
  { pattern: /\.fly\.dev$/i, provider: "Fly.io" },
  { pattern: /\.azurewebsites\.net$/i, provider: "Microsoft Azure" },
  { pattern: /\.wixdns\.net$/i, provider: "Wix" },
  { pattern: /\.squarespace\.com$/i, provider: "Squarespace" },
  { pattern: /\.webflow\.io$/i, provider: "Webflow" },
  { pattern: /\.cdn\.cloudflare\.net$/i, provider: "Cloudflare" },
  { pattern: /\.amazonaws\.com$/i, provider: "AWS" },
];

const A_RECORD_HOSTING_SIGNATURES: Array<{ addresses: Set<string>; provider: string }> = [
  {
    addresses: new Set([
      "185.199.108.153",
      "185.199.109.153",
      "185.199.110.153",
      "185.199.111.153",
    ]),
    provider: "GitHub Pages",
  },
];

function matchProvider(
  value: string,
  signatures: Array<{ pattern: RegExp; provider: string }>,
): string | null {
  return signatures.find((s) => s.pattern.test(value))?.provider ?? null;
}

/** `app.example.com` -> `example.com`. Wrong for a multi-part public suffix (`example.co.uk`) — a known, documented limitation of this heuristic, not a full public-suffix-list lookup. */
function guessApex(host: string): string {
  const labels = host.split(".");
  return labels.length > 2 ? labels.slice(-2).join(".") : host;
}

/**
 * Best-effort "who manages this domain's DNS, and who's hosting it"
 * detection from real DNS records — used only to tailor the DNS-TXT
 * verification instructions shown to the user (e.g. naming their actual
 * DNS dashboard) and, later, to choose a scan strategy. Never blocks
 * target creation: every lookup failure (NXDOMAIN, no records, a
 * resolver timeout) is swallowed and reported as "unknown," not thrown —
 * an undetected provider just falls back to generic instructions.
 */
export async function detectProvider(
  host: string,
  resolver: DnsResolverLike = defaultResolver,
): Promise<ProviderDetection> {
  const apex = guessApex(host);

  const [nsOnHost, nsOnApex, cnames, addresses] = await Promise.all([
    resolver.resolveNs(host).catch(() => [] as string[]),
    host === apex ? Promise.resolve([] as string[]) : resolver.resolveNs(apex).catch(() => []),
    resolver.resolveCname(host).catch(() => [] as string[]),
    resolver.resolve4(host).catch(() => [] as string[]),
  ]);

  const nameservers = nsOnHost.length > 0 ? nsOnHost : nsOnApex;
  const cname = cnames[0] ?? null;

  let hostingProvider = cname ? matchProvider(cname, CNAME_HOSTING_SIGNATURES) : null;
  if (!hostingProvider) {
    for (const sig of A_RECORD_HOSTING_SIGNATURES) {
      if (addresses.some((a) => sig.addresses.has(a))) {
        hostingProvider = sig.provider;
        break;
      }
    }
  }

  let nameserverProvider: string | null = null;
  for (const ns of nameservers) {
    nameserverProvider = matchProvider(ns, NAMESERVER_SIGNATURES);
    if (nameserverProvider) break;
  }

  return {
    host,
    resolvable: nameservers.length > 0 || cnames.length > 0 || addresses.length > 0,
    nameservers,
    nameserverProvider,
    cname,
    hostingProvider,
    addresses,
  };
}
