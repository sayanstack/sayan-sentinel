import { describe, expect, it } from "vitest";
import { isBlockedIPv4, isBlockedIPv6 } from "./ip-blocklist";

describe("isBlockedIPv4", () => {
  it("blocks loopback", () => {
    expect(isBlockedIPv4("127.0.0.1")).toBe(true);
  });

  it("blocks the cloud metadata endpoint (link-local range)", () => {
    expect(isBlockedIPv4("169.254.169.254")).toBe(true);
  });

  it("blocks RFC1918 private ranges", () => {
    expect(isBlockedIPv4("10.0.0.5")).toBe(true);
    expect(isBlockedIPv4("172.16.0.5")).toBe(true);
    expect(isBlockedIPv4("172.31.255.255")).toBe(true);
    expect(isBlockedIPv4("192.168.1.1")).toBe(true);
  });

  it("does not block an address just outside the RFC1918 172.16.0.0/12 range", () => {
    expect(isBlockedIPv4("172.32.0.1")).toBe(false);
    expect(isBlockedIPv4("172.15.255.255")).toBe(false);
  });

  it("allows an ordinary public IP", () => {
    expect(isBlockedIPv4("8.8.8.8")).toBe(false);
    expect(isBlockedIPv4("93.184.216.34")).toBe(false);
  });

  it("fails closed (treats as blocked) for a malformed IPv4-looking string", () => {
    expect(isBlockedIPv4("999.999.999.999")).toBe(true);
    expect(isBlockedIPv4("not-an-ip")).toBe(true);
  });
});

describe("isBlockedIPv6", () => {
  it("blocks loopback", () => {
    expect(isBlockedIPv6("::1")).toBe(true);
  });

  it("blocks link-local addresses", () => {
    expect(isBlockedIPv6("fe80::1")).toBe(true);
    expect(isBlockedIPv6("fe80::abcd:1234")).toBe(true);
  });

  it("blocks unique local addresses", () => {
    expect(isBlockedIPv6("fc00::1")).toBe(true);
    expect(isBlockedIPv6("fd12:3456::1")).toBe(true);
  });

  it("blocks an IPv4-mapped loopback/private address by checking the embedded IPv4", () => {
    expect(isBlockedIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIPv6("::ffff:10.0.0.5")).toBe(true);
  });

  it("blocks an IPv4-mapped address given in hex-hextet form, not just dotted-decimal", () => {
    // `::ffff:7f00:1` is the same address as `::ffff:127.0.0.1` — the form
    // `net.isIP`/a URL literal's normalized hostname actually produces.
    expect(isBlockedIPv6("::ffff:7f00:1")).toBe(true);
    // `::ffff:a00:5` == `::ffff:10.0.0.5`
    expect(isBlockedIPv6("::ffff:a00:5")).toBe(true);
  });

  it("allows an ordinary public IPv6 address", () => {
    expect(isBlockedIPv6("2001:4860:4860::8888")).toBe(false);
  });
});
