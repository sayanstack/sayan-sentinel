import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { walkRepositoryFiles } from "./file-walker";

let canCreateSymlinks = false;

beforeAll(() => {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-symlink-probe-"));
  try {
    fs.symlinkSync(probeDir, path.join(probeDir, "self-link"), "junction");
    canCreateSymlinks = true;
  } catch {
    canCreateSymlinks = false;
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
});

describe("walkRepositoryFiles", () => {
  let root: string;
  let outsideDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-walk-root-"));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-walk-outside-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it("collects ordinary text files with correct relative paths", async () => {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "index.ts"), "export const x = 1;\n");
    fs.writeFileSync(path.join(root, "README.md"), "# demo\n");

    const result = await walkRepositoryFiles(root);

    const relativePaths = result.files.map((f) => f.relativePath).sort();
    expect(relativePaths).toEqual(["README.md", "src/index.ts"]);
    expect(result.skipped).toHaveLength(0);
  });

  it("excludes vendor/generated directories by name anywhere in the tree", async () => {
    fs.mkdirSync(path.join(root, "node_modules", "left-pad"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules", "left-pad", "index.js"), "module.exports = {};");
    fs.mkdirSync(path.join(root, "packages", "app", "dist"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", "app", "dist", "bundle.js"), "console.log(1);");
    fs.mkdirSync(path.join(root, "packages", "app", "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", "app", "src", "main.ts"), "console.log(2);");

    const result = await walkRepositoryFiles(root);

    expect(result.files.map((f) => f.relativePath)).toEqual(["packages/app/src/main.ts"]);
    expect(result.skipped.some((s) => s.reason === "excluded_dir" && s.relativePath === "node_modules")).toBe(
      true,
    );
  });

  it("skips files over the per-file size limit rather than truncating them", async () => {
    const bigFile = path.join(root, "huge.txt");
    fs.writeFileSync(bigFile, "x".repeat(1000));

    const result = await walkRepositoryFiles(root, { maxFileSizeBytes: 100 });

    expect(result.files).toHaveLength(0);
    expect(result.skipped).toEqual([{ relativePath: "huge.txt", reason: "too_large" }]);
  });

  it("aborts once the aggregate repository size budget is exceeded", async () => {
    fs.writeFileSync(path.join(root, "a.txt"), "a".repeat(50));
    fs.writeFileSync(path.join(root, "b.txt"), "b".repeat(50));

    const result = await walkRepositoryFiles(root, { maxRepositorySizeBytes: 60, maxFileSizeBytes: 1000 });

    expect(result.files.length).toBeLessThan(2);
    expect(result.skipped.some((s) => s.reason === "repository_size_budget_exceeded")).toBe(true);
  });

  it("excludes binary files detected by content, not just extension", async () => {
    fs.writeFileSync(path.join(root, "data.bin"), Buffer.from([0x41, 0x00, 0x42]));
    fs.writeFileSync(path.join(root, "text.txt"), "plain text");

    const result = await walkRepositoryFiles(root);

    expect(result.files.map((f) => f.relativePath)).toEqual(["text.txt"]);
    expect(result.skipped).toEqual([{ relativePath: "data.bin", reason: "binary" }]);
  });

  it.skipIf(!canCreateSymlinks)(
    "refuses to follow a symlink that escapes the ingestion root",
    async () => {
      fs.symlinkSync(outsideDir, path.join(root, "escape-link"), "junction");

      const result = await walkRepositoryFiles(root);

      expect(result.files).toHaveLength(0);
      expect(
        result.skipped.some((s) => s.relativePath === "escape-link" && s.reason === "symlink_escapes_root"),
      ).toBe(true);
    },
  );

  it.skipIf(!canCreateSymlinks)("follows a symlink that resolves back inside the root", async () => {
    fs.mkdirSync(path.join(root, "real-target"), { recursive: true });
    fs.writeFileSync(path.join(root, "real-target", "inside.ts"), "export {};");
    fs.symlinkSync(path.join(root, "real-target"), path.join(root, "link-to-inside"), "junction");

    const result = await walkRepositoryFiles(root);

    expect(result.files.map((f) => f.relativePath).sort()).toEqual([
      "link-to-inside/inside.ts",
      "real-target/inside.ts",
    ]);
  });
});
