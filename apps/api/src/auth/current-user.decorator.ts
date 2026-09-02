import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "./session-auth.guard";

/**
 * Resolves to `req.user.userId` — a real `User.id`, set by
 * `SessionAuthGuard`. Every controller previously read `x-demo-user-id`
 * as a plain string via `@Headers()`; this is a drop-in replacement of
 * the same shape so call sites and service signatures didn't need to
 * change, only how the id is obtained.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) {
    throw new Error("CurrentUser used outside a route guarded by SessionAuthGuard");
  }
  return request.user.userId;
});
