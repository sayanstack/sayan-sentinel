import { describe, expect, it } from "vitest";
import { resolveAndCheckHost } from "./resolve-and-check";

describe("resolveAndCheckHost", () => {
  it("blocks a literal private IPv4 address without needing DNS resolution", async () => {
    const result = await resolveAndCheckHost("169.254.169.254", { localLabMode: false });
    expect(result.blocked).toBe(true);
    expect(result.resolvedAddresses).toEqual(["169.254.169.254"]);
  });

  it("allows a literal public IPv4 address", async () => {
    const result = await resolveAndCheckHost("93.184.216.34", { localLabMode: false });
    expect(result.blocked).toBe(false);
  });

  it("blocks a hostname that resolves to a private address (DNS-rebinding style check), using an injected resolver", async () => {
    const result = await resolveAndCheckHost("internal.example.com", {
      localLabMode: false,
      resolver: async () => ["10.0.0.5"],
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("10.0.0.5");
  });

  it("allows a hostname that resolves to a public address, using an injected resolver", async () => {
    const result = await resolveAndCheckHost("public.example.com", {
      localLabMode: false,
      resolver: async () => ["93.184.216.34"],
    });
    expect(result.blocked).toBe(false);
  });

  it("blocks a hostname when DNS resolution fails, rather than treating unresolvable as safe", async () => {
    const result = await resolveAndCheckHost("nonexistent.invalid", {
      localLabMode: false,
      resolver: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("ENOTFOUND");
  });

  it("blocks known cloud-metadata-style hostnames outright", async () => {
    const result = await resolveAndCheckHost("metadata.google.internal", {
      localLabMode: false,
      resolver: async () => ["169.254.169.254"],
    });
    expect(result.blocked).toBe(true);
  });

  it("allows a private address when localLabMode is enabled", async () => {
    const result = await resolveAndCheckHost("localhost-service", {
      localLabMode: true,
      resolver: async () => ["127.0.0.1"],
    });
    expect(result.blocked).toBe(false);
  });

  it("blocks when a hostname resolves to multiple addresses and any one of them is private", async () => {
    const result = await resolveAndCheckHost("multi.example.com", {
      localLabMode: false,
      resolver: async () => ["93.184.216.34", "10.0.0.1"],
    });
    expect(result.blocked).toBe(true);
  });
});
