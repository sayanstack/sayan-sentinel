import { detectProvider, type DnsResolverLike } from "./detect-provider";

function fakeResolver(overrides: Partial<DnsResolverLike>): DnsResolverLike {
  return {
    resolveNs: async () => [],
    resolveCname: async () => [],
    resolve4: async () => [],
    ...overrides,
  };
}

describe("detectProvider", () => {
  it("identifies Cloudflare from nameserver records", async () => {
    const resolver = fakeResolver({
      resolveNs: async () => ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"],
    });

    const result = await detectProvider("example.com", resolver);

    expect(result.nameserverProvider).toBe("Cloudflare");
    expect(result.resolvable).toBe(true);
  });

  it("identifies Vercel from a CNAME target", async () => {
    const resolver = fakeResolver({
      resolveCname: async () => ["cname.vercel-dns.com"],
    });

    const result = await detectProvider("app.example.com", resolver);

    expect(result.hostingProvider).toBe("Vercel");
    expect(result.cname).toBe("cname.vercel-dns.com");
  });

  it("identifies GitHub Pages from its well-known A records", async () => {
    const resolver = fakeResolver({
      resolve4: async () => ["185.199.108.153"],
    });

    const result = await detectProvider("example.com", resolver);

    expect(result.hostingProvider).toBe("GitHub Pages");
  });

  it("falls back to the apex domain's nameservers for a subdomain", async () => {
    const resolver = fakeResolver({
      resolveNs: async (host) => (host === "example.com" ? ["ns1.domaincontrol.com"] : []),
    });

    const result = await detectProvider("app.example.com", resolver);

    expect(result.nameserverProvider).toBe("GoDaddy");
  });

  it("reports unresolvable rather than throwing when every lookup fails", async () => {
    const resolver = fakeResolver({
      resolveNs: async () => {
        throw new Error("ENOTFOUND");
      },
      resolveCname: async () => {
        throw new Error("ENOTFOUND");
      },
      resolve4: async () => {
        throw new Error("ENOTFOUND");
      },
    });

    const result = await detectProvider("nonexistent-domain-xyz.invalid", resolver);

    expect(result.resolvable).toBe(false);
    expect(result.nameserverProvider).toBeNull();
    expect(result.hostingProvider).toBeNull();
  });

  it("returns null providers for unrecognized DNS infrastructure", async () => {
    const resolver = fakeResolver({
      resolveNs: async () => ["ns1.some-obscure-registrar.example"],
    });

    const result = await detectProvider("example.com", resolver);

    expect(result.nameserverProvider).toBeNull();
    expect(result.resolvable).toBe(true);
  });
});
