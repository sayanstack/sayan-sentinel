import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { createSessionToken } from "@sayan-sentinel/auth";
import type { SentinelConfig } from "@sayan-sentinel/config";
import { SessionAuthGuard, type AuthenticatedRequest } from "./session-auth.guard";

const SECRET = "guard-test-secret";

function contextWithAuthHeader(authorization?: string): ExecutionContext {
  const request = { headers: { authorization } } as AuthenticatedRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function configWith(secret: string | undefined): SentinelConfig {
  return { env: { SESSION_SECRET: secret } } as unknown as SentinelConfig;
}

describe("SessionAuthGuard", () => {
  it("rejects a request with no Authorization header", () => {
    const guard = new SessionAuthGuard(configWith(SECRET));
    expect(() => guard.canActivate(contextWithAuthHeader(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a header that isn't a Bearer token", () => {
    const guard = new SessionAuthGuard(configWith(SECRET));
    expect(() => guard.canActivate(contextWithAuthHeader("Basic abc123"))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a syntactically valid but wrongly-signed token", () => {
    const guard = new SessionAuthGuard(configWith(SECRET));
    const token = createSessionToken({ userId: "u1", githubLogin: "octocat" }, "wrong-secret");
    expect(() => guard.canActivate(contextWithAuthHeader(`Bearer ${token}`))).toThrow(
      UnauthorizedException,
    );
  });

  it("throws when SESSION_SECRET isn't configured, rather than accepting any token", () => {
    const guard = new SessionAuthGuard(configWith(undefined));
    const token = createSessionToken({ userId: "u1", githubLogin: "octocat" }, SECRET);
    expect(() => guard.canActivate(contextWithAuthHeader(`Bearer ${token}`))).toThrow(
      UnauthorizedException,
    );
  });

  it("attaches req.user and allows the request through for a valid token", () => {
    const guard = new SessionAuthGuard(configWith(SECRET));
    const token = createSessionToken({ userId: "u1", githubLogin: "octocat" }, SECRET);
    const request = { headers: { authorization: `Bearer ${token}` } } as AuthenticatedRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({ userId: "u1", githubLogin: "octocat" });
  });
});
