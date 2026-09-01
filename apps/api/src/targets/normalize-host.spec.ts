import { normalizeHost } from "./normalize-host";

describe("normalizeHost", () => {
  it("passes a bare hostname through, lowercased", () => {
    expect(normalizeHost("APP.Example.com")).toBe("app.example.com");
  });

  it("strips a https:// scheme and any path/query", () => {
    expect(normalizeHost("https://app.example.com/dashboard?x=1")).toBe("app.example.com");
  });

  it("strips a http:// scheme", () => {
    expect(normalizeHost("http://example.com")).toBe("example.com");
  });

  it("strips a trailing slash with no path", () => {
    expect(normalizeHost("example.com/")).toBe("example.com");
  });

  it("strips a trailing dot (a technically-valid absolute hostname)", () => {
    expect(normalizeHost("example.com.")).toBe("example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHost("  example.com  ")).toBe("example.com");
  });

  it("returns null for an empty string", () => {
    expect(normalizeHost("")).toBeNull();
  });

  it("returns null for a single-label host with no dot", () => {
    expect(normalizeHost("localhost")).toBeNull();
  });

  it("returns null for a bare IP address", () => {
    expect(normalizeHost("192.168.1.1")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(normalizeHost("not a domain at all!!")).toBeNull();
  });
});
