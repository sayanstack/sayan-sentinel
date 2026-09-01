/**
 * Hand-rolled, minimal payload types covering only the fields this service
 * actually reads from each of the 4 subscribed webhook events
 * (`GITHUB_APP_WEBHOOK_EVENTS` in `@sayan-sentinel/github`) — not a full
 * `@octokit/webhooks-types` import, since the extra dependency would buy
 * nothing beyond what's used here.
 */

export interface GithubAccount {
  login: string;
  type: string;
}

export interface GithubInstallationRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
}

export interface GithubInstallationPayload {
  action: "created" | "deleted" | "suspend" | "unsuspend" | string;
  installation: {
    id: number;
    account: GithubAccount | null;
  };
  repositories?: GithubInstallationRepo[];
}

export interface GithubInstallationRepositoriesPayload {
  action: "added" | "removed" | string;
  installation: { id: number };
  repositories_added?: GithubInstallationRepo[];
  repositories_removed?: Array<{ id: number }>;
}

export interface GithubPushPayload {
  ref: string;
  after: string;
  deleted: boolean;
  repository: {
    id: number;
    name: string;
    owner: { login: string };
    default_branch: string;
  };
  installation?: { id: number };
}

export interface GithubPullRequestPayload {
  action: "opened" | "synchronize" | "reopened" | string;
  number: number;
  pull_request: {
    head: { sha: string; ref: string };
    base: { ref: string };
  };
  repository: {
    id: number;
    name: string;
    owner: { login: string };
  };
  installation?: { id: number };
}
