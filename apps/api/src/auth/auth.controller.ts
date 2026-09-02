import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { SentinelConfig } from "@sayan-sentinel/config";
import type { Response } from "express";
import { SENTINEL_CONFIG } from "../config/sentinel-config.constants";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { SessionAuthGuard } from "./session-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(SENTINEL_CONFIG) private readonly config: SentinelConfig,
  ) {}

  @Get("github/login")
  login(@Res() res: Response): void {
    if (!this.authService.isConfigured) {
      throw new ServiceUnavailableException(
        "GitHub sign-in isn't configured on this deployment yet.",
      );
    }
    const { url } = this.authService.buildAuthorizeUrl();
    res.redirect(url);
  }

  /**
   * GitHub redirects the browser here after the user approves (or denies)
   * the authorization. The API and web app are on different origins
   * (Railway vs. Vercel), so a cookie set here would never reach the
   * frontend's own server-side requests — instead the session token is
   * handed off once, in the redirect URL itself, to a same-origin frontend
   * route that sets its own cookie. The token is single-use only in the
   * sense that it's short-lived in the URL/referrer window; it's the same
   * long-lived session token the frontend will keep using afterward.
   */
  @Get("github/callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const appUrl = this.config.env.APP_URL;
    if (error || !code) {
      res.redirect(`${appUrl}/login?error=${encodeURIComponent(error ?? "missing_code")}`);
      return;
    }
    if (!this.authService.verifyState(state)) {
      res.redirect(`${appUrl}/login?error=invalid_state`);
      return;
    }

    try {
      const { token } = await this.authService.completeLogin(code);
      res.redirect(`${appUrl}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch {
      res.redirect(`${appUrl}/login?error=login_failed`);
    }
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  async me(@CurrentUser() userId: string) {
    const user = await this.authService.getUserById(userId);
    if (!user) throw new NotFoundException();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }
}
