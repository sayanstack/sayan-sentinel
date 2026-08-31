# @sayan-sentinel/github

GitHub App integration: webhook verification, idempotent delivery handling, PR change-sensitivity triage, and the Octokit-based App client.

**Status:** implemented against verified real SDK usage. No GitHub App credentials are configured in this environment, so `GitHubAppClient`'s live API calls haven't been exercised end-to-end — stated plainly rather than implied otherwise.

## What's here

- `verifyWebhookSignature()` — HMAC-SHA256 verification of
  `X-Hub-Signature-256`, constant-time comparison.
- `isDuplicateDelivery()` / `InMemoryDeliveryStore` — idempotent webhook
  processing keyed on GitHub's delivery id.
- `classifyChangedFiles()` — fast triage of a PR's changed files into
  sensitivity categories (auth, authorization, database, config,
  dependencies, CI/CD, external requests).
- `GITHUB_APP_PERMISSIONS` / `GITHUB_APP_WEBHOOK_EVENTS` — the exact,
  justified minimum permission set this App requests.
- `GitHubAppClient` — installation sync, PR/file retrieval, check runs,
  and the branch/commit/PR sequence the remediation workflow will use.

## Testing

```bash
pnpm --filter @sayan-sentinel/github test
```
