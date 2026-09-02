import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { GitHubAppClient } from "@sayan-sentinel/github";
import { prisma } from "@sayan-sentinel/database";
import type { Queue } from "bullmq";
import type { ScanJobData } from "@sayan-sentinel/queue";
import { writeAuditEvent } from "../audit/write-audit-event";
import { GITHUB_APP_CLIENT, SCAN_QUEUE } from "./github.constants";
import { generateUniqueOrganizationSlug } from "./slugify";
import type {
  GithubInstallationPayload,
  GithubInstallationRepositoriesPayload,
  GithubInstallationRepo,
  GithubPullRequestPayload,
  GithubPushPayload,
} from "./webhook-payloads";

export interface WebhookHandlingResult {
  status: string;
}

/**
 * Handles the 4 webhook events Sentinel's GitHub App subscribes to
 * (`GITHUB_APP_WEBHOOK_EVENTS`). This is the first code in the whole
 * codebase that ever writes to `Installation`/`Repository` from a GitHub
 * event, and the first that ever enqueues a scan job onto
 * `@sayan-sentinel/queue`'s `SCAN_QUEUE_NAME` — `apps/worker`'s consumer
 * side has existed since Phase 13, but nothing has ever produced a job for
 * it until now.
 *
 * Deliberately conservative in one place, documented inline: an
 * `installation.deleted` event never deletes historical `Scan`/`Finding`
 * rows (it marks the installation suspended instead — an automated,
 * unattended webhook handler is not the place for an irreversible cascade
 * delete). A newly auto-provisioned `Organization` (created the first time
 * a GitHub account installs the App) still has zero `Membership` rows at
 * the moment this handler runs — there is no authenticated user in a
 * server-to-server webhook request to attach one to — but that's no
 * longer a permanent gap: `AuthService.ensureOrganizationMembership`
 * (`apps/api/src/auth/auth.service.ts`) links the first real user who
 * signs in under a matching GitHub login to this organization.
 */
@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(
    @Inject(GITHUB_APP_CLIENT) private readonly githubClient: GitHubAppClient | null,
    @Inject(SCAN_QUEUE) private readonly scanQueue: Queue<ScanJobData>,
  ) {}

  async dispatch(eventName: string | undefined, payload: unknown): Promise<WebhookHandlingResult> {
    switch (eventName) {
      case "installation":
        return this.handleInstallation(payload as GithubInstallationPayload);
      case "installation_repositories":
        return this.handleInstallationRepositories(
          payload as GithubInstallationRepositoriesPayload,
        );
      case "push":
        return this.handlePush(payload as GithubPushPayload);
      case "pull_request":
        return this.handlePullRequest(payload as GithubPullRequestPayload);
      default:
        this.logger.warn(`Ignoring unhandled webhook event: ${eventName}`);
        return { status: "ignored-unhandled-event" };
    }
  }

  async handleInstallation(payload: GithubInstallationPayload): Promise<WebhookHandlingResult> {
    const githubInstallationId = String(payload.installation.id);

    if (payload.action === "suspend" || payload.action === "unsuspend") {
      const existing = await prisma.installation.findUnique({ where: { githubInstallationId } });
      if (!existing) return { status: "installation-not-found" };
      await prisma.installation.update({
        where: { id: existing.id },
        data: { suspendedAt: payload.action === "suspend" ? new Date() : null },
      });
      return { status: "ok" };
    }

    if (payload.action === "deleted") {
      const existing = await prisma.installation.findUnique({ where: { githubInstallationId } });
      if (!existing) return { status: "installation-not-found" };
      // Never cascade-delete historical Scan/Finding data as a side effect
      // of an unattended webhook — record the uninstall as a suspension.
      await prisma.installation.update({
        where: { id: existing.id },
        data: { suspendedAt: new Date() },
      });
      return { status: "ok" };
    }

    if (payload.action !== "created") {
      return { status: "ignored-unhandled-action" };
    }

    const existing = await prisma.installation.findUnique({ where: { githubInstallationId } });
    if (existing) {
      // Redelivered "created" event for an installation Sentinel already
      // knows about — treat as an idempotent no-op rather than erroring.
      return { status: "already-exists" };
    }

    if (!payload.installation.account) {
      return { status: "missing-account" };
    }

    const slug = await generateUniqueOrganizationSlug(payload.installation.account.login);
    const organization = await prisma.organization.create({
      data: { name: payload.installation.account.login, slug },
    });

    const installation = await prisma.installation.create({
      data: {
        organizationId: organization.id,
        githubInstallationId,
        accountLogin: payload.installation.account.login,
        accountType: payload.installation.account.type,
      },
    });

    if (payload.repositories && payload.repositories.length > 0) {
      await this.syncRepositories(
        organization.id,
        installation.id,
        payload.installation.id,
        payload.repositories,
      );
    }

    await writeAuditEvent({
      organizationId: organization.id,
      action: "GITHUB_APP_INSTALLED",
      resourceType: "Installation",
      resourceId: installation.id,
      result: "success",
      metadata: { accountLogin: installation.accountLogin },
    });

    return { status: "ok" };
  }

  async handleInstallationRepositories(
    payload: GithubInstallationRepositoriesPayload,
  ): Promise<WebhookHandlingResult> {
    const installation = await prisma.installation.findUnique({
      where: { githubInstallationId: String(payload.installation.id) },
    });
    if (!installation) return { status: "installation-not-found" };

    if (payload.action === "added" && payload.repositories_added?.length) {
      await this.syncRepositories(
        installation.organizationId,
        installation.id,
        payload.installation.id,
        payload.repositories_added,
      );
    }

    // `repositories_removed` is intentionally a no-op: Sentinel doesn't yet
    // track per-repository access revocation independent of the whole
    // installation, so a repository whose access was removed stays in
    // Sentinel's inventory until a future full-sync feature exists.

    return { status: "ok" };
  }

  async handlePush(payload: GithubPushPayload): Promise<WebhookHandlingResult> {
    if (payload.deleted || /^0+$/.test(payload.after)) {
      return { status: "ignored-branch-deletion" };
    }

    const repository = await prisma.repository.findUnique({
      where: { githubRepoId: String(payload.repository.id) },
    });
    if (!repository) return { status: "repository-not-registered" };
    if (!payload.installation) return { status: "missing-installation-context" };

    const scanId = randomUUID();
    const repositoryUrl = await this.buildCloneUrl(
      payload.installation.id,
      payload.repository.owner.login,
      payload.repository.name,
    );

    await this.scanQueue.add("scan", {
      repositoryUrl,
      commitSha: payload.after,
      branch: payload.ref.replace(/^refs\/heads\//, ""),
      workspaceDir: join(tmpdir(), "sentinel-scans", scanId),
      scanId,
      localLabMode: false,
      repositoryId: repository.id,
      trigger: "PUSH",
      github: {
        installationId: payload.installation.id,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
      },
    } satisfies ScanJobData);

    await writeAuditEvent({
      organizationId: repository.organizationId,
      action: "SCAN_ENQUEUED_FROM_PUSH",
      resourceType: "Repository",
      resourceId: repository.id,
      result: "success",
      metadata: { commitSha: payload.after, ref: payload.ref, scanId },
    });

    return { status: "enqueued" };
  }

  async handlePullRequest(payload: GithubPullRequestPayload): Promise<WebhookHandlingResult> {
    if (!["opened", "synchronize", "reopened"].includes(payload.action)) {
      return { status: "ignored-unhandled-action" };
    }

    const repository = await prisma.repository.findUnique({
      where: { githubRepoId: String(payload.repository.id) },
    });
    if (!repository) return { status: "repository-not-registered" };
    if (!payload.installation) return { status: "missing-installation-context" };

    const scanId = randomUUID();
    const repositoryUrl = await this.buildCloneUrl(
      payload.installation.id,
      payload.repository.owner.login,
      payload.repository.name,
    );

    await this.scanQueue.add("scan", {
      repositoryUrl,
      commitSha: payload.pull_request.head.sha,
      branch: payload.pull_request.head.ref,
      workspaceDir: join(tmpdir(), "sentinel-scans", scanId),
      scanId,
      localLabMode: false,
      repositoryId: repository.id,
      trigger: "PULL_REQUEST",
      github: {
        installationId: payload.installation.id,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
      },
    } satisfies ScanJobData);

    await writeAuditEvent({
      organizationId: repository.organizationId,
      action: "SCAN_ENQUEUED_FROM_PULL_REQUEST",
      resourceType: "Repository",
      resourceId: repository.id,
      result: "success",
      metadata: {
        pullRequestNumber: payload.number,
        commitSha: payload.pull_request.head.sha,
        scanId,
      },
    });

    return { status: "enqueued" };
  }

  /**
   * Real installation repositories carry only id/name/full_name/private —
   * not `default_branch` — so the true default branch is fetched from the
   * GitHub API rather than guessed at (e.g. assuming "main"). Falls back to
   * "main" only if the GitHub App isn't configured at all (e.g. in a test
   * or a misconfigured deployment), which is the only situation where no
   * real API call is possible.
   */
  private async syncRepositories(
    organizationId: string,
    installationId: string,
    githubInstallationId: number,
    repos: GithubInstallationRepo[],
  ): Promise<void> {
    for (const repo of repos) {
      const owner = repo.full_name.split("/")[0] ?? repo.name;
      const defaultBranch = await this.fetchDefaultBranch(githubInstallationId, owner, repo.name);

      await prisma.repository.upsert({
        where: { githubRepoId: String(repo.id) },
        create: {
          organizationId,
          installationId,
          githubRepoId: String(repo.id),
          owner,
          name: repo.name,
          defaultBranch,
          private: repo.private,
        },
        update: {
          owner,
          name: repo.name,
          defaultBranch,
          private: repo.private,
        },
      });
    }
  }

  /**
   * The manual counterpart to `handlePush`/`handlePullRequest` — same
   * enqueue logic, triggered by a user clicking "Scan now" instead of a
   * webhook, against the repository's default branch HEAD. Callers are
   * responsible for their own tenant-access check before calling this
   * (mirrors `RepositoriesController`'s existing pattern) since this takes
   * a bare repositoryId, not a userId.
   */
  async triggerManualScan(
    repositoryId: string,
  ): Promise<
    { ok: true; scanId: string } | { ok: false; reason: "not_found" | "github_not_configured" }
  > {
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: { installation: true },
    });
    if (!repository) return { ok: false, reason: "not_found" };
    if (!this.githubClient) return { ok: false, reason: "github_not_configured" };

    const githubInstallationId = Number(repository.installation.githubInstallationId);
    const branch = await this.fetchDefaultBranch(
      githubInstallationId,
      repository.owner,
      repository.name,
    );

    let commitSha: string;
    try {
      commitSha = await this.githubClient.getBranchHeadSha(
        githubInstallationId,
        repository.owner,
        repository.name,
        branch,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch HEAD sha for ${repository.owner}/${repository.name}@${branch}: ${String(error)}`,
      );
      return { ok: false, reason: "github_not_configured" };
    }

    const scanId = randomUUID();
    const repositoryUrl = await this.buildCloneUrl(
      githubInstallationId,
      repository.owner,
      repository.name,
    );

    await this.scanQueue.add("scan", {
      repositoryUrl,
      commitSha,
      branch,
      workspaceDir: join(tmpdir(), "sentinel-scans", scanId),
      scanId,
      localLabMode: false,
      repositoryId: repository.id,
      trigger: "MANUAL",
      github: {
        installationId: githubInstallationId,
        owner: repository.owner,
        repo: repository.name,
      },
    } satisfies ScanJobData);

    await writeAuditEvent({
      organizationId: repository.organizationId,
      action: "SCAN_ENQUEUED_MANUALLY",
      resourceType: "Repository",
      resourceId: repository.id,
      result: "success",
      metadata: { commitSha, branch, scanId },
    });

    return { ok: true, scanId };
  }

  private async fetchDefaultBranch(
    githubInstallationId: number,
    owner: string,
    repo: string,
  ): Promise<string> {
    if (!this.githubClient) return "main";
    try {
      const data = await this.githubClient.getRepository(githubInstallationId, owner, repo);
      return data.default_branch;
    } catch (error) {
      this.logger.warn(`Failed to fetch default branch for ${owner}/${repo}: ${String(error)}`);
      return "main";
    }
  }

  private async buildCloneUrl(
    githubInstallationId: number,
    owner: string,
    repo: string,
  ): Promise<string> {
    if (!this.githubClient) {
      return `https://github.com/${owner}/${repo}.git`;
    }
    try {
      const token = await this.githubClient.createInstallationAccessToken(githubInstallationId);
      return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    } catch (error) {
      this.logger.warn(`Failed to mint installation token for ${owner}/${repo}: ${String(error)}`);
      return `https://github.com/${owner}/${repo}.git`;
    }
  }
}
