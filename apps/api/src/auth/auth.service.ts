import { Inject, Injectable, Logger } from "@nestjs/common";
import { createOAuthState, createSessionToken, verifyOAuthState } from "@sayan-sentinel/auth";
import type { SentinelConfig } from "@sayan-sentinel/config";
import { prisma, type User } from "@sayan-sentinel/database";
import { generateUniqueOrganizationSlug } from "../github/slugify";
import { SENTINEL_CONFIG } from "../config/sentinel-config.constants";

interface GithubUserResponse {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

/**
 * Reuses the GitHub App's own Client ID/Secret as a standard OAuth client
 * (every GitHub App supports the normal `github.com/login/oauth/authorize`
 * flow for user login — no separate OAuth App registration needed). No
 * `scope` parameter is sent: GitHub Apps grant user-to-server data access
 * through the App's own "User permissions" configuration, not OAuth
 * scopes, and this App only needs the basic identity fields
 * (`login`/`id`/`avatar_url`/`name`) that `/user` returns unconditionally.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject(SENTINEL_CONFIG) private readonly config: SentinelConfig) {}

  get isConfigured(): boolean {
    return !!(
      this.config.env.GITHUB_APP_CLIENT_ID &&
      this.config.env.GITHUB_APP_CLIENT_SECRET &&
      this.config.env.SESSION_SECRET
    );
  }

  buildAuthorizeUrl(): { url: string; state: string } {
    const state = createOAuthState(this.requireSessionSecret());
    const params = new URLSearchParams({
      client_id: this.requireEnv("GITHUB_APP_CLIENT_ID"),
      redirect_uri: `${this.config.env.API_URL}/auth/github/callback`,
      state,
    });
    return { url: `https://github.com/login/oauth/authorize?${params.toString()}`, state };
  }

  verifyState(state: string | undefined): boolean {
    if (!state) return false;
    return verifyOAuthState(state, this.requireSessionSecret());
  }

  /**
   * Exchanges the one-time `code` for a user-to-server access token, loads
   * the GitHub identity, upserts the matching `User` row (matched on the
   * stable `githubUserId`, not email — a GitHub login's email can change
   * or be private), links the user to an organization, and returns a
   * signed session token for the frontend to store.
   */
  async completeLogin(code: string): Promise<{ token: string; user: User }> {
    const accessToken = await this.exchangeCodeForToken(code);
    const githubUser = await this.fetchGithubUser(accessToken);

    const email =
      githubUser.email ?? `${githubUser.id}+${githubUser.login}@users.noreply.github.com`;
    const user = await prisma.user.upsert({
      where: { githubUserId: String(githubUser.id) },
      update: { name: githubUser.name, avatarUrl: githubUser.avatar_url },
      create: {
        githubUserId: String(githubUser.id),
        email,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
      },
    });

    await this.ensureOrganizationMembership(user.id, githubUser.login);

    const token = createSessionToken(
      { userId: user.id, githubLogin: githubUser.login },
      this.requireSessionSecret(),
    );
    return { token, user };
  }

  async getUserById(userId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id: userId } });
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.requireEnv("GITHUB_APP_CLIENT_ID"),
        client_secret: this.requireEnv("GITHUB_APP_CLIENT_SECRET"),
        code,
      }),
    });
    const data = (await response.json()) as { access_token?: string; error?: string };
    if (!data.access_token) {
      this.logger.error(
        `GitHub OAuth code exchange failed: ${data.error ?? "no access_token in response"}`,
      );
      throw new Error("GitHub OAuth code exchange failed");
    }
    return data.access_token;
  }

  private async fetchGithubUser(accessToken: string): Promise<GithubUserResponse> {
    const response = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      throw new Error(`GitHub /user request failed with status ${response.status}`);
    }
    return (await response.json()) as GithubUserResponse;
  }

  /**
   * Links a newly-authenticated user to their organization(s). Only ever
   * runs for a user with zero existing memberships — an established user
   * signing back in is never re-linked, so nothing here can silently pull
   * them into an org after the fact.
   *
   * Two sources, both additive:
   *  1. Any `Installation` whose `accountLogin` matches this GitHub login —
   *     closes the gap where installing the GitHub App auto-provisions an
   *     Organization with zero members (see docs/implementation-plan.md).
   *  2. Any organization that currently has zero memberships at all — a
   *     one-time claim of pre-existing orgs (e.g. seed/demo data created
   *     before real auth existed). This is only correct for a
   *     single-operator deployment with no real signups yet; it must be
   *     removed before a second real user ever signs in, in favor of a
   *     real invite flow.
   *
   * If neither source yields an organization, creates a fresh personal one.
   */
  private async ensureOrganizationMembership(userId: string, githubLogin: string): Promise<void> {
    const existingCount = await prisma.membership.count({ where: { userId } });
    if (existingCount > 0) return;

    const organizationIds = new Set<string>();

    const installation = await prisma.installation.findFirst({
      where: { accountLogin: githubLogin },
      select: { organizationId: true },
    });
    if (installation) organizationIds.add(installation.organizationId);

    const orphanedOrganizations = await prisma.organization.findMany({
      where: { memberships: { none: {} } },
      select: { id: true },
    });
    for (const org of orphanedOrganizations) organizationIds.add(org.id);

    if (organizationIds.size === 0) {
      const slug = await generateUniqueOrganizationSlug(githubLogin);
      const org = await prisma.organization.create({ data: { name: githubLogin, slug } });
      organizationIds.add(org.id);
    }

    await prisma.membership.createMany({
      data: Array.from(organizationIds).map((organizationId) => ({
        userId,
        organizationId,
        role: "OWNER" as const,
      })),
      skipDuplicates: true,
    });
  }

  private requireSessionSecret(): string {
    return this.requireEnv("SESSION_SECRET");
  }

  private requireEnv(
    key: "GITHUB_APP_CLIENT_ID" | "GITHUB_APP_CLIENT_SECRET" | "SESSION_SECRET",
  ): string {
    const value = this.config.env[key];
    if (!value) throw new Error(`${key} is not configured`);
    return value;
  }
}
