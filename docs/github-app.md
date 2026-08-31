# GitHub App

Sentinel integrates with GitHub as a GitHub App, not via personal access
tokens — an App's permissions are explicit, scoped, and installable
per-repository, unlike a PAT which typically carries a user's full access.

## Permissions requested (`packages/github/src/permissions.ts`)

| Permission      | Level | Why                                                                                                                                |
| --------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `contents`      | read  | Read repository content to ingest and analyze it. Never write — Sentinel never edits files directly, only via PRs it opens itself. |
| `metadata`      | read  | Baseline permission GitHub requires for any installation.                                                                          |
| `pull_requests` | write | Read PR diffs/changed files; write to open the remediation PR and comment on findings.                                             |
| `checks`        | write | Report scan status as a check run on commits/PRs.                                                                                  |
| `issues`        | read  | Linked issues can give the AI engine business-logic context. Never write.                                                          |

A "permissions contract" test (`permissions.test.ts`) fails loudly if a
future change adds a scope without updating the justification comment in
the same commit — this is a deliberate speed bump against silent scope
creep.

## Webhook events

`installation`, `installation_repositories`, `push`, `pull_request` — each
tied to a concrete feature (installation lifecycle, repository selection
changes, scan triggering).

## Webhook security

Every webhook must pass `verifyWebhookSignature()` — constant-time
HMAC-SHA256 verification of the `X-Hub-Signature-256` header — before its
body is trusted. This must run against the exact raw request body bytes
GitHub signed, before any JSON parsing that could alter whitespace or key
order.

Every webhook delivery is checked against `isDuplicateDelivery()`, keyed
on GitHub's per-delivery-attempt id, so a retried delivery (GitHub retries
on timeout/5xx) doesn't trigger a duplicate scan or action.

## `GitHubAppClient`

Wraps `@octokit/app` + `@octokit/rest` for installation sync, PR/file
retrieval, check runs, and the branch → commit → PR sequence the
remediation workflow needs. Real, correct SDK usage — its constructor
shape and `getInstallationOctokit` method were verified against the
library's own documentation — but **has not been exercised against a live
GitHub App**: no GitHub App credentials are configured in this
environment.

## Setting up a real GitHub App (what you need to supply)

1. Create a GitHub App at
   `https://github.com/settings/apps/new` with the permissions and
   webhook events listed above.
2. Generate a private key for it; save the `.pem` file somewhere the API/
   worker process can read (never commit it).
3. Set in your `.env`:
   ```
   GITHUB_APP_ID=<app id>
   GITHUB_APP_SLUG=<app slug>
   GITHUB_APP_CLIENT_ID=<client id>
   GITHUB_APP_CLIENT_SECRET=<client secret>
   GITHUB_APP_PRIVATE_KEY_PATH=./secrets/github-app-private-key.pem
   GITHUB_WEBHOOK_SECRET=<a random secret you choose, configured identically on the App's webhook settings>
   ```
4. Install the App on the repository/repositories you want Sentinel to
   analyze.

Until these are supplied, `features.githubAppEnabled` (from
`@sayan-sentinel/config`) is `false` and GitHub-dependent functionality is
left in its documented "not configured" state — never faked.
