import { execFile } from "node:child_process";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { redactCredentialsFromUrl } from "@sayan-sentinel/shared";
import { type IngestionPolicy, resolveIngestionPolicy } from "./ingestion-policy";

const execFileAsync = promisify(execFile);

/**
 * Removes every literal occurrence of the (possibly credential-bearing) raw
 * repository URL from `text`, in addition to structural URL-based
 * redaction. git's own stderr frequently embeds the exact remote URL
 * verbatim (e.g. `unable to access 'https://user:pass@host/...'`), so
 * pattern-based redaction alone isn't enough — we know the exact secret
 * string and scrub it directly.
 */
function scrubRepositoryUrl(text: string, repositoryUrl: string): string {
  const redacted = redactCredentialsFromUrl(repositoryUrl);
  return text.split(repositoryUrl).join(redacted);
}

export class GitCommandError extends Error {
  public readonly stderr: string;

  constructor(
    public readonly args: readonly string[],
    rawStderr: string,
    public readonly timedOut: boolean,
    repositoryUrl: string,
  ) {
    const stderr = scrubRepositoryUrl(rawStderr, repositoryUrl);
    super(
      `git ${scrubRepositoryUrl(args.join(" "), repositoryUrl)} failed for ${redactCredentialsFromUrl(
        repositoryUrl,
      )}${timedOut ? " (timed out)" : ""}: ${stderr.trim().slice(0, 2000)}`,
    );
    this.name = "GitCommandError";
    this.stderr = stderr;
  }
}

export interface CloneCommitOptions {
  repositoryUrl: string;
  commitSha: string;
  /** Used only as a fallback path if the server won't fetch the SHA directly. */
  branch?: string;
  destinationDir: string;
  policy?: Partial<IngestionPolicy>;
}

export interface CloneCommitResult {
  destinationDir: string;
  commitSha: string;
}

interface RunGitOptions {
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  repositoryUrl: string;
}

async function runGit(args: string[], options: RunGitOptions): Promise<void> {
  try {
    await execFileAsync("git", args, {
      timeout: options.timeoutMs,
      env: options.env,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    const execError = error as { stderr?: string; killed?: boolean; signal?: string };
    const timedOut = Boolean(execError.killed && execError.signal === "SIGTERM");
    throw new GitCommandError(
      args,
      execError.stderr ?? String(error),
      timedOut,
      options.repositoryUrl,
    );
  }
}

/**
 * Clones a single commit of a repository into an empty destination
 * directory, never executing any code from the repository itself (only
 * `git` plumbing commands run — no install scripts, no hooks from the
 * remote). Repository content is untrusted input throughout.
 *
 * Strategy: a blobless partial clone (`--filter=blob:none`) fetching the
 * exact commit SHA directly — GitHub (this product's primary integration)
 * supports fetching an arbitrary reachable SHA without first fetching full
 * branch history. If the server refuses a direct SHA fetch, falls back to
 * a shallow fetch of `branch` and checks out the SHA from there.
 */
export async function cloneRepositoryAtCommit(
  options: CloneCommitOptions,
): Promise<CloneCommitResult> {
  const policy = resolveIngestionPolicy(options.policy);
  const destinationDir = path.resolve(options.destinationDir);
  await fsp.mkdir(destinationDir, { recursive: true });

  const emptyHooksDir = await fsp.mkdtemp(path.join(os.tmpdir(), "sentinel-empty-hooks-"));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_LFS_SKIP_SMUDGE: "1",
  };
  const runOptions: RunGitOptions = {
    timeoutMs: policy.gitCommandTimeoutMs,
    env,
    repositoryUrl: options.repositoryUrl,
  };
  const configArgs = ["-c", `core.hooksPath=${emptyHooksDir}`, "-c", "advice.detachedHead=false"];
  const repo = ["-C", destinationDir];

  try {
    await runGit(["init", "--quiet", destinationDir], runOptions);
    await runGit(
      [...configArgs, ...repo, "remote", "add", "origin", options.repositoryUrl],
      runOptions,
    );

    try {
      await runGit(
        [
          ...configArgs,
          ...repo,
          "fetch",
          "--quiet",
          "--depth",
          "1",
          "--filter=blob:none",
          "origin",
          options.commitSha,
        ],
        runOptions,
      );
    } catch (directFetchError) {
      if (!options.branch) throw directFetchError;
      await runGit(
        [
          ...configArgs,
          ...repo,
          "fetch",
          "--quiet",
          "--depth",
          "50",
          "--filter=blob:none",
          "origin",
          options.branch,
        ],
        runOptions,
      );
    }

    await runGit([...configArgs, ...repo, "checkout", "--quiet", "FETCH_HEAD"], runOptions);

    const headSha = await execFileAsync("git", [...repo, "rev-parse", "HEAD"], {
      env,
      windowsHide: true,
    });
    const resolvedSha = headSha.stdout.trim();
    if (options.branch && resolvedSha !== options.commitSha) {
      // Fallback path landed on the branch tip, not the requested commit —
      // this only happens if the direct-SHA fetch failed AND the branch
      // fallback also couldn't reach the exact commit within its depth.
      throw new Error(
        `Checked out ${resolvedSha} but ${options.commitSha} was requested; it is not reachable within the fallback fetch depth`,
      );
    }

    return { destinationDir, commitSha: resolvedSha };
  } finally {
    await fsp.rm(emptyHooksDir, { recursive: true, force: true });
  }
}
