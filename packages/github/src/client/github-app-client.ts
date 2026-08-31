import * as fs from "node:fs";
import { App } from "@octokit/app";
import { Octokit as OctokitRest } from "@octokit/rest";

/**
 * Used only for the handful of methods below that return the *whole*
 * Octokit response object (status/headers/data) rather than just
 * `.data` — TS can't emit a portable .d.ts type for those without an
 * explicit annotation (TS2742), because the inferred type spans several
 * Octokit plugin packages' internal types. Deriving it from the
 * OctokitRest instance type itself (rather than importing @octokit/types
 * as a separate dependency) avoids a real version-mismatch bug: pnpm
 * resolved three different @octokit/types versions simultaneously when
 * this package also declared its own dependency on it, and their
 * structural types disagreed (e.g. `id: number` vs `id: number | bigint`
 * across versions) — this way there's only ever one source of truth.
 */
type RestOctokit = InstanceType<typeof OctokitRest>;
type RestResponse<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;

export interface GitHubAppClientOptions {
  appId: string;
  privateKeyPath: string;
  webhookSecret: string;
}

export interface CheckRunParams {
  headSha: string;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required";
  title?: string;
  summary?: string;
}

export interface CreatePullRequestParams {
  title: string;
  head: string;
  base: string;
  body: string;
}

/**
 * Thin wrapper around `@octokit/app`. This is real, correct SDK usage
 * (constructor shape and `getInstallationOctokit` verified against the
 * library's own documentation) but has NOT been exercised against a live
 * GitHub App — no GitHub App credentials are configured in this
 * environment. Stated plainly rather than implied otherwise; see
 * docs/github-app.md.
 */
export class GitHubAppClient {
  private readonly app: App<{ Octokit: typeof OctokitRest }>;

  constructor(options: GitHubAppClientOptions) {
    const privateKey = fs.readFileSync(options.privateKeyPath, "utf8");
    this.app = new App({
      appId: options.appId,
      privateKey,
      webhooks: { secret: options.webhookSecret },
      // The App package's default bundled Octokit only has .request() —
      // using @octokit/rest's class here gets the .rest.* convenience
      // methods used throughout this file.
      Octokit: OctokitRest,
    });
  }

  /** Exposes the underlying webhooks event emitter for wiring up event handlers. */
  get webhooks(): App<{ Octokit: typeof OctokitRest }>["webhooks"] {
    return this.app.webhooks;
  }

  private getInstallationOctokit(installationId: number) {
    return this.app.getInstallationOctokit(installationId);
  }

  async listInstallationRepositories(installationId: number) {
    const octokit = await this.getInstallationOctokit(installationId);
    const { data } = await octokit.request("GET /installation/repositories");
    return data.repositories;
  }

  async getRepository(installationId: number, owner: string, repo: string) {
    const octokit = await this.getInstallationOctokit(installationId);
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return data;
  }

  async getPullRequest(installationId: number, owner: string, repo: string, pullNumber: number) {
    const octokit = await this.getInstallationOctokit(installationId);
    const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
    return data;
  }

  async listPullRequestFiles(
    installationId: number,
    owner: string,
    repo: string,
    pullNumber: number,
  ) {
    const octokit = await this.getInstallationOctokit(installationId);
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });
    return data;
  }

  async createCheckRun(
    installationId: number,
    owner: string,
    repo: string,
    params: CheckRunParams,
  ): Promise<RestResponse<RestOctokit["rest"]["checks"]["create"]>> {
    const octokit = await this.getInstallationOctokit(installationId);
    return octokit.rest.checks.create({
      owner,
      repo,
      name: params.name,
      head_sha: params.headSha,
      status: params.status,
      conclusion: params.conclusion,
      output:
        params.title && params.summary
          ? { title: params.title, summary: params.summary }
          : undefined,
    });
  }

  /** Creates a branch pointing at `fromSha` — the first step of the approved-patch-PR workflow (Section 27). */
  async createBranch(
    installationId: number,
    owner: string,
    repo: string,
    branchName: string,
    fromSha: string,
  ): Promise<RestResponse<RestOctokit["rest"]["git"]["createRef"]>> {
    const octokit = await this.getInstallationOctokit(installationId);
    return octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    });
  }

  async commitFileChange(
    installationId: number,
    owner: string,
    repo: string,
    params: { branch: string; path: string; content: string; message: string; sha?: string },
  ): Promise<RestResponse<RestOctokit["rest"]["repos"]["createOrUpdateFileContents"]>> {
    const octokit = await this.getInstallationOctokit(installationId);
    return octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: params.path,
      message: params.message,
      content: Buffer.from(params.content, "utf8").toString("base64"),
      branch: params.branch,
      sha: params.sha,
    });
  }

  /** Opens the remediation PR itself. Never called without prior human approval (Section 27: "Never automatically merge," and approval happens upstream of this call). */
  async createPullRequest(
    installationId: number,
    owner: string,
    repo: string,
    params: CreatePullRequestParams,
  ): Promise<RestResponse<RestOctokit["rest"]["pulls"]["create"]>> {
    const octokit = await this.getInstallationOctokit(installationId);
    return octokit.rest.pulls.create({
      owner,
      repo,
      title: params.title,
      head: params.head,
      base: params.base,
      body: params.body,
    });
  }
}
