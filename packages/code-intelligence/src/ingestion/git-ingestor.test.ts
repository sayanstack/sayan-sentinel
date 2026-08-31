import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cloneRepositoryAtCommit, GitCommandError } from "./git-ingestor";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function gitOutput(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
}

describe("cloneRepositoryAtCommit", () => {
  let originDir: string;
  let destParent: string;
  let destDir: string;
  let firstCommitSha: string;
  let secondCommitSha: string;

  beforeEach(() => {
    originDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-origin-"));
    destParent = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-dest-parent-"));
    destDir = path.join(destParent, "checkout");

    git(["init", "--quiet", "-b", "main"], originDir);
    git(["config", "user.email", "test@example.com"], originDir);
    git(["config", "user.name", "Sentinel Test"], originDir);
    git(["config", "uploadpack.allowReachableSHA1InWant", "true"], originDir);

    fs.writeFileSync(path.join(originDir, "first.txt"), "first\n");
    git(["add", "."], originDir);
    git(["commit", "--quiet", "-m", "first commit"], originDir);
    firstCommitSha = gitOutput(["rev-parse", "HEAD"], originDir);

    fs.writeFileSync(path.join(originDir, "second.txt"), "second\n");
    git(["add", "."], originDir);
    git(["commit", "--quiet", "-m", "second commit"], originDir);
    secondCommitSha = gitOutput(["rev-parse", "HEAD"], originDir);
  });

  afterEach(() => {
    fs.rmSync(originDir, { recursive: true, force: true });
    fs.rmSync(destParent, { recursive: true, force: true });
  });

  it("checks out the exact requested commit, not just HEAD", async () => {
    const result = await cloneRepositoryAtCommit({
      repositoryUrl: originDir,
      commitSha: firstCommitSha,
      destinationDir: destDir,
    });

    expect(result.commitSha).toBe(firstCommitSha);
    expect(fs.existsSync(path.join(destDir, "first.txt"))).toBe(true);
    expect(fs.existsSync(path.join(destDir, "second.txt"))).toBe(false);
  });

  it("checks out the latest commit when requested", async () => {
    const result = await cloneRepositoryAtCommit({
      repositoryUrl: originDir,
      commitSha: secondCommitSha,
      destinationDir: destDir,
    });

    expect(result.commitSha).toBe(secondCommitSha);
    expect(fs.existsSync(path.join(destDir, "second.txt"))).toBe(true);
  });

  it("never executes repository content — a shell script is checked out as inert data", async () => {
    fs.writeFileSync(path.join(originDir, "malicious.sh"), "#!/bin/sh\necho pwned > PWNED\n");
    git(["add", "."], originDir);
    git(["commit", "--quiet", "-m", "add script"], originDir);
    const shaWithScript = gitOutput(["rev-parse", "HEAD"], originDir);

    await cloneRepositoryAtCommit({
      repositoryUrl: originDir,
      commitSha: shaWithScript,
      destinationDir: destDir,
    });

    expect(fs.existsSync(path.join(destDir, "malicious.sh"))).toBe(true);
    expect(fs.existsSync(path.join(destDir, "PWNED"))).toBe(false);
  });

  it("falls back to a branch fetch when the direct SHA fetch is refused, and still lands on the exact commit", async () => {
    git(["config", "uploadpack.allowReachableSHA1InWant", "false"], originDir);

    const result = await cloneRepositoryAtCommit({
      repositoryUrl: originDir,
      commitSha: firstCommitSha,
      branch: "main",
      destinationDir: destDir,
    });

    expect(result.commitSha).toBe(firstCommitSha);
    expect(fs.existsSync(path.join(destDir, "second.txt"))).toBe(false);
  });

  it("redacts an embedded credential from both the error message and the captured stderr", async () => {
    expect.assertions(3);
    try {
      await cloneRepositoryAtCommit({
        repositoryUrl: "https://x-access-token:super-secret-token@example.invalid/nope.git",
        commitSha: "0".repeat(40),
        destinationDir: destDir,
        policy: { gitCommandTimeoutMs: 8000 },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(GitCommandError);
      const gitError = error as GitCommandError;
      expect(gitError.message).not.toContain("super-secret-token");
      expect(gitError.stderr).not.toContain("super-secret-token");
    }
  }, 15_000);
});
