/**
 * The exact GitHub App permissions Sentinel requests — no more. Each
 * entry is justified so a reviewer (or a future contributor tempted to
 * add "just in case" scopes) can see why it's here (Section 6: "Store the
 * minimum necessary permissions... Never request unnecessary repository
 * permissions").
 */
export const GITHUB_APP_PERMISSIONS = {
  /** Read repository content to ingest and analyze it. Never "write" — Sentinel never edits files directly, only via PRs it opens itself. */
  contents: "read",
  /** Baseline permission GitHub requires for any App installation. */
  metadata: "read",
  /** Read PR diffs/changed files for PR-triggered analysis; write to open the remediation PR itself and comment on findings. */
  pull_requests: "write",
  /** Report scan status as a check run on commits/PRs. */
  checks: "write",
  /** Read-only: linked issues can give the AI engine business-logic context. Never write — Sentinel doesn't manage issues. */
  issues: "read",
} as const;

export type GitHubAppPermissionScope = keyof typeof GITHUB_APP_PERMISSIONS;

/**
 * The only webhook events Sentinel subscribes to — each tied to a
 * concrete feature (installation lifecycle, repo selection changes, scan
 * triggering on push/PR).
 */
export const GITHUB_APP_WEBHOOK_EVENTS = [
  "installation",
  "installation_repositories",
  "push",
  "pull_request",
] as const;

export type GitHubAppWebhookEvent = (typeof GITHUB_APP_WEBHOOK_EVENTS)[number];
