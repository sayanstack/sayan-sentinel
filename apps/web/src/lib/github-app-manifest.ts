/**
 * The exact scopes/events Sentinel's GitHub App needs — mirrors
 * `GITHUB_APP_PERMISSIONS`/`GITHUB_APP_WEBHOOK_EVENTS` in
 * `packages/github/src/permissions.ts`. Duplicated rather than imported:
 * apps/web has no workspace-package dependency on any backend package
 * today (it only ever talks to the API over HTTP), and that package's
 * barrel also re-exports `GitHubAppClient`, which pulls in `@octokit/app`
 * — not something worth dragging into this app's dependency graph for two
 * small, rarely-changing constant lists. Keep these two in sync by hand.
 */
const GITHUB_APP_PERMISSIONS = {
  contents: "read",
  metadata: "read",
  pull_requests: "write",
  checks: "write",
  issues: "read",
} as const;

const GITHUB_APP_WEBHOOK_EVENTS = [
  "installation",
  "installation_repositories",
  "push",
  "pull_request",
] as const;

export interface GithubAppManifest {
  name: string;
  url: string;
  hook_attributes: { url: string };
  redirect_url: string;
  public: boolean;
  default_permissions: Record<string, string>;
  default_events: readonly string[];
}

/**
 * Builds the manifest for GitHub's "create an App from a manifest" flow —
 * submitting a form with this as the `manifest` field to
 * `https://github.com/settings/apps/new` takes the user straight to a
 * pre-filled review screen; approving it creates a real App and redirects
 * back to `redirect_url` with a one-time `?code=` to exchange for
 * credentials. See https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
 */
export function buildGithubAppManifest(params: {
  appOrigin: string;
  apiOrigin: string;
}): GithubAppManifest {
  return {
    name: "Sayan Sentinel",
    url: params.appOrigin,
    hook_attributes: { url: `${params.apiOrigin}/github/webhook` },
    redirect_url: `${params.appOrigin}/integrations/github-callback`,
    // Private by default — installable on this account's own repositories;
    // can be made public from the App's own GitHub settings later.
    public: false,
    default_permissions: GITHUB_APP_PERMISSIONS,
    default_events: GITHUB_APP_WEBHOOK_EVENTS,
  };
}
