import { prisma } from "@sayan-sentinel/database";
import type { GitHubAppClient } from "@sayan-sentinel/github";
import type { Queue } from "bullmq";
import type { ScanJobData } from "@sayan-sentinel/queue";
import { GithubWebhookService } from "./github-webhook.service";
import type {
  GithubInstallationPayload,
  GithubInstallationRepositoriesPayload,
  GithubPullRequestPayload,
  GithubPushPayload,
} from "./webhook-payloads";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    organization: { create: jest.fn(), findUnique: jest.fn() },
    installation: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    repository: { findUnique: jest.fn(), upsert: jest.fn() },
    auditEvent: { create: jest.fn() },
  },
}));

function fakeGithubClient(overrides: Partial<GitHubAppClient> = {}): GitHubAppClient {
  return {
    getRepository: jest.fn().mockResolvedValue({ default_branch: "main" }),
    createInstallationAccessToken: jest.fn().mockResolvedValue("fake-installation-token"),
    ...overrides,
  } as unknown as GitHubAppClient;
}

function fakeQueue(): Queue<ScanJobData> {
  return { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue<ScanJobData>;
}

describe("GithubWebhookService.handleInstallation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("auto-provisions an Organization and Installation on a fresh install", async () => {
    (prisma.installation.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.organization.create as jest.Mock).mockResolvedValue({ id: "org-1", slug: "acme" });
    (prisma.installation.create as jest.Mock).mockResolvedValue({
      id: "install-1",
      accountLogin: "acme",
    });

    const service = new GithubWebhookService(fakeGithubClient(), fakeQueue());
    const payload: GithubInstallationPayload = {
      action: "created",
      installation: { id: 555, account: { login: "acme", type: "Organization" } },
    };

    const result = await service.handleInstallation(payload);

    expect(result.status).toBe("ok");
    expect(prisma.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "acme" }) }),
    );
    expect(prisma.installation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org-1", githubInstallationId: "555" }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalled();
  });

  it("is idempotent for a redelivered 'created' event", async () => {
    (prisma.installation.findUnique as jest.Mock).mockResolvedValue({ id: "install-1" });

    const service = new GithubWebhookService(fakeGithubClient(), fakeQueue());
    const result = await service.handleInstallation({
      action: "created",
      installation: { id: 555, account: { login: "acme", type: "Organization" } },
    });

    expect(result.status).toBe("already-exists");
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it("fetches the real default branch from GitHub when syncing initial repositories", async () => {
    (prisma.installation.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.organization.create as jest.Mock).mockResolvedValue({ id: "org-1", slug: "acme" });
    (prisma.installation.create as jest.Mock).mockResolvedValue({ id: "install-1" });
    const githubClient = fakeGithubClient({
      getRepository: jest.fn().mockResolvedValue({ default_branch: "develop" }),
    });

    const service = new GithubWebhookService(githubClient, fakeQueue());
    await service.handleInstallation({
      action: "created",
      installation: { id: 555, account: { login: "acme", type: "Organization" } },
      repositories: [{ id: 1, name: "widgets", full_name: "acme/widgets", private: true }],
    });

    expect(prisma.repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          owner: "acme",
          name: "widgets",
          defaultBranch: "develop",
        }),
      }),
    );
  });

  it("marks the installation suspended (never deletes) on an uninstall", async () => {
    (prisma.installation.findUnique as jest.Mock).mockResolvedValue({ id: "install-1" });

    const service = new GithubWebhookService(fakeGithubClient(), fakeQueue());
    const result = await service.handleInstallation({
      action: "deleted",
      installation: { id: 555, account: null },
    });

    expect(result.status).toBe("ok");
    expect(prisma.installation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "install-1" },
        data: expect.objectContaining({ suspendedAt: expect.any(Date) }),
      }),
    );
  });

  it("clears suspendedAt on unsuspend", async () => {
    (prisma.installation.findUnique as jest.Mock).mockResolvedValue({ id: "install-1" });

    const service = new GithubWebhookService(fakeGithubClient(), fakeQueue());
    await service.handleInstallation({
      action: "unsuspend",
      installation: { id: 555, account: null },
    });

    expect(prisma.installation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { suspendedAt: null } }),
    );
  });
});

describe("GithubWebhookService.handleInstallationRepositories", () => {
  beforeEach(() => jest.clearAllMocks());

  it("upserts newly added repositories against the matching installation", async () => {
    (prisma.installation.findUnique as jest.Mock).mockResolvedValue({
      id: "install-1",
      organizationId: "org-1",
    });

    const service = new GithubWebhookService(fakeGithubClient(), fakeQueue());
    const payload: GithubInstallationRepositoriesPayload = {
      action: "added",
      installation: { id: 555 },
      repositories_added: [{ id: 2, name: "backend", full_name: "acme/backend", private: false }],
    };

    const result = await service.handleInstallationRepositories(payload);

    expect(result.status).toBe("ok");
    expect(prisma.repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { githubRepoId: "2" },
        create: expect.objectContaining({ installationId: "install-1", organizationId: "org-1" }),
      }),
    );
  });

  it("does nothing when the installation isn't known yet", async () => {
    (prisma.installation.findUnique as jest.Mock).mockResolvedValue(null);

    const service = new GithubWebhookService(fakeGithubClient(), fakeQueue());
    const result = await service.handleInstallationRepositories({
      action: "added",
      installation: { id: 999 },
      repositories_added: [{ id: 2, name: "backend", full_name: "acme/backend", private: false }],
    });

    expect(result.status).toBe("installation-not-found");
    expect(prisma.repository.upsert).not.toHaveBeenCalled();
  });
});

describe("GithubWebhookService.handlePush", () => {
  beforeEach(() => jest.clearAllMocks());

  const basePush: GithubPushPayload = {
    ref: "refs/heads/main",
    after: "abc123def456",
    deleted: false,
    repository: { id: 42, name: "widgets", owner: { login: "acme" }, default_branch: "main" },
    installation: { id: 555 },
  };

  it("enqueues a scan job with an authenticated clone URL for a registered repository", async () => {
    (prisma.repository.findUnique as jest.Mock).mockResolvedValue({
      id: "repo-1",
      organizationId: "org-1",
    });
    const queue = fakeQueue();
    const service = new GithubWebhookService(fakeGithubClient(), queue);

    const result = await service.handlePush(basePush);

    expect(result.status).toBe("enqueued");
    expect(queue.add).toHaveBeenCalledWith(
      "scan",
      expect.objectContaining({
        commitSha: "abc123def456",
        branch: "main",
        repositoryId: "repo-1",
        trigger: "PUSH",
        repositoryUrl: "https://x-access-token:fake-installation-token@github.com/acme/widgets.git",
        github: { installationId: 555, owner: "acme", repo: "widgets" },
      }),
    );
  });

  it("does not enqueue anything for an unregistered repository", async () => {
    (prisma.repository.findUnique as jest.Mock).mockResolvedValue(null);
    const queue = fakeQueue();
    const service = new GithubWebhookService(fakeGithubClient(), queue);

    const result = await service.handlePush(basePush);

    expect(result.status).toBe("repository-not-registered");
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("ignores a branch-deletion push", async () => {
    const queue = fakeQueue();
    const service = new GithubWebhookService(fakeGithubClient(), queue);

    const result = await service.handlePush({ ...basePush, deleted: true });

    expect(result.status).toBe("ignored-branch-deletion");
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.repository.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to a public clone URL when no GitHub client is configured", async () => {
    (prisma.repository.findUnique as jest.Mock).mockResolvedValue({
      id: "repo-1",
      organizationId: "org-1",
    });
    const queue = fakeQueue();
    const service = new GithubWebhookService(null, queue);

    await service.handlePush(basePush);

    expect(queue.add).toHaveBeenCalledWith(
      "scan",
      expect.objectContaining({ repositoryUrl: "https://github.com/acme/widgets.git" }),
    );
  });
});

describe("GithubWebhookService.handlePullRequest", () => {
  beforeEach(() => jest.clearAllMocks());

  const basePr: GithubPullRequestPayload = {
    action: "opened",
    number: 7,
    pull_request: { head: { sha: "pr-sha-1", ref: "feature/x" }, base: { ref: "main" } },
    repository: { id: 42, name: "widgets", owner: { login: "acme" } },
    installation: { id: 555 },
  };

  it("enqueues a scan job for an opened pull request against a registered repository", async () => {
    (prisma.repository.findUnique as jest.Mock).mockResolvedValue({
      id: "repo-1",
      organizationId: "org-1",
    });
    const queue = fakeQueue();
    const service = new GithubWebhookService(fakeGithubClient(), queue);

    const result = await service.handlePullRequest(basePr);

    expect(result.status).toBe("enqueued");
    expect(queue.add).toHaveBeenCalledWith(
      "scan",
      expect.objectContaining({
        commitSha: "pr-sha-1",
        branch: "feature/x",
        trigger: "PULL_REQUEST",
      }),
    );
  });

  it("ignores a pull_request action it doesn't act on (e.g. closed)", async () => {
    const queue = fakeQueue();
    const service = new GithubWebhookService(fakeGithubClient(), queue);

    const result = await service.handlePullRequest({ ...basePr, action: "closed" });

    expect(result.status).toBe("ignored-unhandled-action");
    expect(queue.add).not.toHaveBeenCalled();
  });
});
