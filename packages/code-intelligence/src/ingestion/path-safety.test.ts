import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { isWithinRoot, PathTraversalError, resolveWithinRoot } from "./path-safety";

describe("resolveWithinRoot", () => {
  const root = path.resolve(path.sep, "workspace", "repo");

  it("resolves a simple relative path inside root", () => {
    const result = resolveWithinRoot(root, "src/index.ts");
    expect(result).toBe(path.join(root, "src", "index.ts"));
  });

  it("resolves the root itself", () => {
    expect(resolveWithinRoot(root, ".")).toBe(path.resolve(root));
  });

  it("throws PathTraversalError for a classic ../ escape", () => {
    expect(() => resolveWithinRoot(root, "../../etc/passwd")).toThrow(PathTraversalError);
  });

  it("throws PathTraversalError for a nested escape buried under legitimate segments", () => {
    expect(() => resolveWithinRoot(root, "src/../../outside/file.ts")).toThrow(PathTraversalError);
  });

  it("throws PathTraversalError for an absolute path pointing elsewhere", () => {
    const elsewhere = path.join(path.sep, "etc", "passwd");
    expect(() => resolveWithinRoot(root, elsewhere)).toThrow(PathTraversalError);
  });

  it("treats an absolute path that happens to be inside root as fine", () => {
    const insideAbsolute = path.join(root, "src", "index.ts");
    expect(resolveWithinRoot(root, insideAbsolute)).toBe(insideAbsolute);
  });
});

describe("isWithinRoot", () => {
  const root = path.resolve(path.sep, "workspace", "repo");

  it("returns true for paths inside root", () => {
    expect(isWithinRoot(root, "src/index.ts")).toBe(true);
  });

  it("returns false instead of throwing for an escape", () => {
    expect(isWithinRoot(root, "../outside")).toBe(false);
  });
});
