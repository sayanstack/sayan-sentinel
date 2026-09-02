import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { SentinelConfig } from "@sayan-sentinel/config";
import { verifySessionToken } from "@sayan-sentinel/auth";
import type { Request } from "express";
import { SENTINEL_CONFIG } from "../config/sentinel-config.constants";

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; githubLogin: string };
}

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

/**
 * Replaces the `x-demo-user-id` header stand-in used throughout the app
 * before real sessions existed. Verifies the `Authorization: Bearer
 * <token>` header against `SESSION_SECRET` and attaches `req.user` — the
 * one thing every controller in this app actually needs, matching the
 * plain `userId: string` shape every service method already expects.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(SENTINEL_CONFIG) private readonly config: SentinelConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException("Missing session token");

    const secret = this.config.env.SESSION_SECRET;
    if (!secret) throw new UnauthorizedException("Session auth is not configured");

    const payload = verifySessionToken(token, secret);
    if (!payload) throw new UnauthorizedException("Invalid or expired session token");

    request.user = { userId: payload.userId, githubLogin: payload.githubLogin };
    return true;
  }
}
