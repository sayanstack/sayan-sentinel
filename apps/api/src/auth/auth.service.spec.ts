import type { SentinelConfig } from "@sayan-sentinel/config";
import { prisma } from "@sayan-sentinel/database";
import { AuthService } from "./auth.service";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: {
    user: { upsert: jest.fn() },
    membership: { count: jest.fn(), createMany: jest.fn() },
    installation: { findFirst: jest.fn() },
    organization: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  },
}));

function configWith(overrides: Partial<SentinelConfig["env"]> = {}): SentinelConfig {
  return {
    env: {
      API_URL: "https://api.example.com",
      GITHUB_APP_CLIENT_ID: "client-id",
      GITHUB_APP_CLIENT_SECRET: "client-secret",
      SESSION_SECRET: "test-secret",
      ...overrides,
    },
  } as unknown as SentinelConfig;
}

const GITHUB_USER = {
  id: 42,
  login: "octocat",
  name: "The Octocat",
  avatar_url: "https://avatars.example.com/octocat.png",
  email: null as string | null,
};

function mockGithubExchangeAndUser() {
  (global.fetch as jest.Mock) = jest
    .fn()
    .mockResolvedValueOnce({ json: async () => ({ access_token: "gh-token" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => GITHUB_USER });
}

describe("AuthService.completeLogin -> ensureOrganizationMembership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.upsert as jest.Mock).mockResolvedValue({
      id: "user-1",
      email: "42+octocat@users.noreply.github.com",
      name: "The Octocat",
      avatarUrl: GITHUB_USER.avatar_url,
    });
  });

  it("skips linking entirely for a user who already has a membership", async () => {
    mockGithubExchangeAndUser();
    (prisma.membership.count as jest.Mock).mockResolvedValue(1);
    const service = new AuthService(configWith());

    await service.completeLogin("code");

    expect(prisma.installation.findFirst).not.toHaveBeenCalled();
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
    expect(prisma.membership.createMany).not.toHaveBeenCalled();
  });

  it("links to the matching Installation's organization for a brand new user", async () => {
    mockGithubExchangeAndUser();
    (prisma.membership.count as jest.Mock).mockResolvedValue(0);
    (prisma.installation.findFirst as jest.Mock).mockResolvedValue({
      organizationId: "org-installed",
    });
    (prisma.organization.findMany as jest.Mock).mockResolvedValue([]);
    const service = new AuthService(configWith());

    await service.completeLogin("code");

    expect(prisma.membership.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ userId: "user-1", organizationId: "org-installed", role: "OWNER" }],
      }),
    );
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it("also claims any orphaned (zero-membership) organizations alongside a matched installation", async () => {
    mockGithubExchangeAndUser();
    (prisma.membership.count as jest.Mock).mockResolvedValue(0);
    (prisma.installation.findFirst as jest.Mock).mockResolvedValue({
      organizationId: "org-installed",
    });
    (prisma.organization.findMany as jest.Mock).mockResolvedValue([
      { id: "org-orphan-1" },
      { id: "org-installed" },
    ]);
    const service = new AuthService(configWith());

    await service.completeLogin("code");

    const call = (prisma.membership.createMany as jest.Mock).mock.calls[0][0];
    const organizationIds = call.data.map((d: { organizationId: string }) => d.organizationId);
    expect(organizationIds.sort()).toEqual(["org-installed", "org-orphan-1"]);
  });

  it("creates a fresh personal organization when no installation matches and nothing is orphaned", async () => {
    mockGithubExchangeAndUser();
    (prisma.membership.count as jest.Mock).mockResolvedValue(0);
    (prisma.installation.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.organization.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.organization.create as jest.Mock).mockResolvedValue({ id: "org-new" });
    const service = new AuthService(configWith());

    await service.completeLogin("code");

    expect(prisma.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "octocat" }) }),
    );
    expect(prisma.membership.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ userId: "user-1", organizationId: "org-new", role: "OWNER" }],
      }),
    );
  });
});

describe("AuthService.buildAuthorizeUrl / verifyState", () => {
  it("builds a GitHub authorize URL carrying a verifiable state", () => {
    const service = new AuthService(configWith());
    const { url, state } = service.buildAuthorizeUrl();

    expect(url).toContain("https://github.com/login/oauth/authorize");
    expect(url).toContain("client_id=client-id");
    expect(url).toContain(encodeURIComponent(state));
    expect(service.verifyState(state)).toBe(true);
  });

  it("rejects a state it didn't issue", () => {
    const service = new AuthService(configWith());
    expect(service.verifyState("forged.state.value")).toBe(false);
  });
});

describe("AuthService.isConfigured", () => {
  it("is false when any required env var is missing", () => {
    expect(new AuthService(configWith({ SESSION_SECRET: undefined })).isConfigured).toBe(false);
  });

  it("is true when the GitHub OAuth client and session secret are all set", () => {
    expect(new AuthService(configWith()).isConfigured).toBe(true);
  });
});
