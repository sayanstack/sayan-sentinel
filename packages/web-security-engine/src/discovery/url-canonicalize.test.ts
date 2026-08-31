import { describe, expect, it } from "vitest";
import { canonicalizeUrl, isSameOrigin, isStaticAssetPath } from "./url-canonicalize";

describe("canonicalizeUrl", () => {
  it("resolves a relative path against the base URL", () => {
    expect(canonicalizeUrl("/about", "https://example.com/home")).toBe("https://example.com/about");
  });

  it("resolves a relative link against a nested page", () => {
    expect(canonicalizeUrl("contact", "https://example.com/pages/home")).toBe(
      "https://example.com/pages/contact",
    );
  });

  it("strips the fragment", () => {
    expect(canonicalizeUrl("/docs#section-2", "https://example.com/")).toBe(
      "https://example.com/docs",
    );
  });

  it("returns undefined for a mailto: link", () => {
    expect(canonicalizeUrl("mailto:hello@example.com", "https://example.com/")).toBeUndefined();
  });

  it("returns undefined for a javascript: link", () => {
    expect(canonicalizeUrl("javascript:void(0)", "https://example.com/")).toBeUndefined();
  });

  it("resolves a bare fragment link to the current page, with the fragment stripped", () => {
    // A same-page anchor is a legitimate resolvable URL, not an error — it
    // just canonicalizes to a URL the crawler will already recognize as visited.
    expect(canonicalizeUrl("#top", "https://example.com/page")).toBe("https://example.com/page");
  });

  it("passes through an already-absolute URL", () => {
    expect(canonicalizeUrl("https://example.com/other", "https://example.com/")).toBe(
      "https://example.com/other",
    );
  });
});

describe("isSameOrigin", () => {
  it("recognizes the same origin", () => {
    expect(isSameOrigin("https://example.com/page", "https://example.com")).toBe(true);
  });

  it("recognizes a different host as a different origin", () => {
    expect(isSameOrigin("https://evil.example.org/page", "https://example.com")).toBe(false);
  });

  it("recognizes a different scheme as a different origin", () => {
    expect(isSameOrigin("http://example.com/page", "https://example.com")).toBe(false);
  });

  it("recognizes a different port as a different origin", () => {
    expect(isSameOrigin("https://example.com:8443/page", "https://example.com")).toBe(false);
  });
});

describe("isStaticAssetPath", () => {
  it("recognizes common static asset extensions", () => {
    expect(isStaticAssetPath("/styles/main.css")).toBe(true);
    expect(isStaticAssetPath("/images/logo.png")).toBe(true);
    expect(isStaticAssetPath("/fonts/roboto.woff2")).toBe(true);
  });

  it("does not treat an ordinary page path as a static asset", () => {
    expect(isStaticAssetPath("/api/users")).toBe(false);
    expect(isStaticAssetPath("/about")).toBe(false);
  });
});
