import { describe, expect, it, vi } from "vitest";
import {
  applyApprovedPatchAsPullRequest,
  PatchNotApprovedError,
  type ApplyPatchDependencies,
  type ApprovedPatch,
} from "./apply-approved-patch";

function baseFakeGithubClient(): ApplyPatchDependencies["githubClient"] {
  return {
    createBranch: vi.fn().mockResolvedValue({}),
    commitFileChange: vi.fn().mockResolvedValue({}),
    createPullRequest: vi.fn().mockResolvedValue({
      data: { number: 42, html_url: "https://github.com/acme/widgets/pull/42" },
    }),
  } as unknown as ApplyPatchDependencies["githubClient"];
}

function basePatch(overrides: Partial<ApprovedPatch> = {}): ApprovedPatch {
  return {
    patchId: "patch-1",
    filePath: "src/app.js",
    updatedFileContent: "fixed content",
    currentFileSha: "blob-sha-abc",
    commitMessage: "Fix SQL injection in user lookup",
    explanation: "Switched to a parameterized query.",
    approvedByUserId: "user-alice",
    installationId: 123,
    repositoryOwner: "acme",
    repositoryName: "widgets",
    baseBranch: "main",
    headSha: "commit-sha-def",
    ...overrides,
  };
}

describe("applyApprovedPatchAsPullRequest", () => {
  it("throws PatchNotApprovedError and never touches GitHub when approvedByUserId is missing", async () => {
    const githubClient = baseFakeGithubClient();
    const patch = basePatch({ approvedByUserId: "" });

    await expect(applyApprovedPatchAsPullRequest(patch, { githubClient })).rejects.toBeInstanceOf(
      PatchNotApprovedError,
    );
    expect(githubClient.createBranch).not.toHaveBeenCalled();
    expect(githubClient.commitFileChange).not.toHaveBeenCalled();
    expect(githubClient.createPullRequest).not.toHaveBeenCalled();
  });

  it("creates a branch, commits the fix, and opens a PR, in that order, once approved", async () => {
    const githubClient = baseFakeGithubClient();
    const patch = basePatch();

    await applyApprovedPatchAsPullRequest(patch, { githubClient });

    expect(githubClient.createBranch).toHaveBeenCalledWith(
      123,
      "acme",
      "widgets",
      "sentinel/fix-patch-1",
      "commit-sha-def",
    );
    expect(githubClient.commitFileChange).toHaveBeenCalledWith(
      123,
      "acme",
      "widgets",
      expect.objectContaining({
        branch: "sentinel/fix-patch-1",
        path: "src/app.js",
        content: "fixed content",
        sha: "blob-sha-abc",
      }),
    );
    expect(githubClient.createPullRequest).toHaveBeenCalledWith(
      123,
      "acme",
      "widgets",
      expect.objectContaining({ head: "sentinel/fix-patch-1", base: "main" }),
    );

    const branchCallOrder = (githubClient.createBranch as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!;
    const commitCallOrder = (githubClient.commitFileChange as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!;
    const prCallOrder = (githubClient.createPullRequest as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!;
    expect(branchCallOrder).toBeLessThan(commitCallOrder);
    expect(commitCallOrder).toBeLessThan(prCallOrder);
  });

  it("includes the approver's identity and the explanation in the PR body", async () => {
    const githubClient = baseFakeGithubClient();
    const patch = basePatch({
      approvedByUserId: "user-bob",
      explanation: "Parameterized the query.",
    });

    await applyApprovedPatchAsPullRequest(patch, { githubClient });

    const prCall = (githubClient.createPullRequest as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = prCall[3].body as string;
    expect(body).toContain("user-bob");
    expect(body).toContain("Parameterized the query.");
  });

  it("includes risks and limitations in the PR body when provided", async () => {
    const githubClient = baseFakeGithubClient();
    const patch = basePatch({
      risks: "Double-check input encoding.",
      limitations: "Doesn't cover the admin panel.",
    });

    await applyApprovedPatchAsPullRequest(patch, { githubClient });

    const prCall = (githubClient.createPullRequest as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = prCall[3].body as string;
    expect(body).toContain("Double-check input encoding.");
    expect(body).toContain("Doesn't cover the admin panel.");
  });
});
