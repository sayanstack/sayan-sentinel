import { parseScopeAsset } from "./parse-scope-asset";

describe("parseScopeAsset", () => {
  it("parses a bare-domain URL asset with default https/443", () => {
    expect(parseScopeAsset("URL", "example.com")).toEqual({
      scheme: "https",
      host: "example.com",
      port: 443,
    });
  });

  it("parses a full URL asset, preserving an explicit scheme and port", () => {
    expect(parseScopeAsset("URL", "http://app.example.com:8080/dashboard")).toEqual({
      scheme: "http",
      host: "app.example.com",
      port: 8080,
    });
  });

  it("lowercases and normalizes the host from a URL asset", () => {
    expect(parseScopeAsset("URL", "HTTPS://APP.Example.COM/")).toEqual({
      scheme: "https",
      host: "app.example.com",
      port: 443,
    });
  });

  it("strips the leading wildcard from a WILDCARD asset", () => {
    expect(parseScopeAsset("WILDCARD", "*.example.com")).toEqual({
      scheme: "https",
      host: "example.com",
      port: 443,
    });
  });

  it("treats a DOMAIN asset the same as a bare hostname", () => {
    expect(parseScopeAsset("DOMAIN", "example.com")).toEqual({
      scheme: "https",
      host: "example.com",
      port: 443,
    });
  });

  it("is case-insensitive on asset_type", () => {
    expect(parseScopeAsset("wildcard", "*.example.com")).toEqual({
      scheme: "https",
      host: "example.com",
      port: 443,
    });
  });

  it("returns null for non-web-scannable asset types", () => {
    expect(parseScopeAsset("GOOGLE_PLAY_APP_ID", "com.example.app")).toBeNull();
    expect(parseScopeAsset("SOURCE_CODE", "github.com/example/repo")).toBeNull();
    expect(parseScopeAsset("HARDWARE", "Router Model X")).toBeNull();
    expect(parseScopeAsset("OTHER", "see policy for details")).toBeNull();
  });

  it("returns null for an unparseable URL identifier", () => {
    expect(parseScopeAsset("URL", "not a url at all!!")).toBeNull();
  });

  it("returns null for a bare-IP identifier (no zone to scope a domain-based target to)", () => {
    expect(parseScopeAsset("URL", "192.0.2.1")).toBeNull();
  });

  it("returns null for an empty identifier", () => {
    expect(parseScopeAsset("URL", "   ")).toBeNull();
  });
});
