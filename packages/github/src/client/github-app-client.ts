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
  /** The PEM content itself. Resolving this from a file path, an inline env var, or anywhere else is the caller's job — this class only ever deals in the key material. */
  privateKey: string;
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
 * Thin wrapper around `@octokit/app`. Exercised against a real, installed
 * GitHub App on a real Railway deployment (see docs/github-app.md) — that
 * live run is what caught `createInstallationAccessToken`'s missing
 * `{ type: "installation" }` argument (see its own doc comment) and an
 * earlier private-key-parsing bug in `resolvePrivateKey`, neither of
 * which any unit test here could have caught since nothing here talks to
 * real Octokit internals.
 */
export class GitHubAppClient {
  private readonly app: App<{ Octokit: typeof OctokitRest }>;

  constructor(options: GitHubAppClientOptions) {
    this.app = new App({
      appId: options.appId,
      privateKey: options.privateKey,
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
  /**
   * Returns a raw installation access token — used to build an
   * authenticated git clone URL (`https://x-access-token:<token>@github.com/...`)
   * for cloning private repositories, since `cloneRepositoryAtCommit`
   * shells out to the real `git` binary and has no way to use an Octokit
   * instance's request-level auth. GitHub installation tokens expire after
   * one hour, so callers should fetch a fresh one per scan rather than
   * caching it.
   */
  async createInstallationAccessToken(installationId: number): Promise<string> {
    const octokit = await this.getInstallationOctokit(installationId);
    // Confirmed against a real deployment: calling `.auth()` with no
    // arguments throws `TypeError: Cannot read properties of undefined
    // (reading 'type')` deep inside @octokit/auth-app, which requires an
    // explicit `{ type: "installation" }` to know which token to mint —
    // it doesn't infer that from the octokit instance already being
    // installation-scoped the way the other `octokit.rest.*` calls in
    // this file do.
    const auth = (await octokit.auth({ type: "installation" })) as { token: string };
    return auth.token;
  }

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
