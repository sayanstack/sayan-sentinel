import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import type { Request } from "express";
import { isDuplicateDelivery, verifyWebhookSignature } from "@sayan-sentinel/github";
import type { DeliveryStore } from "@sayan-sentinel/github";
import type { SentinelConfig } from "@sayan-sentinel/config";
import { SENTINEL_CONFIG } from "../config/sentinel-config.constants";
import { WEBHOOK_DELIVERY_STORE } from "./github.constants";
import { GithubWebhookService, type WebhookHandlingResult } from "./github-webhook.service";

/**
 * The single entry point through which every GitHub-triggered scan in this
 * codebase originates. Requires `{ rawBody: true }` on `NestFactory.create`
 * (set in `main.ts`) — `verifyWebhookSignature` must run against the exact
 * bytes GitHub signed, before Nest's normal JSON body parsing (which still
 * runs in parallel and populates `req.body` as usual for every other route).
 */
@Controller("github")
export class GithubWebhookController {
  constructor(
    private readonly webhookService: GithubWebhookService,
    @Inject(SENTINEL_CONFIG) private readonly config: SentinelConfig,
    @Inject(WEBHOOK_DELIVERY_STORE) private readonly deliveryStore: DeliveryStore,
  ) {}

  /**
   * Lets the frontend render either "Install Sentinel on GitHub" (once a
   * real App exists) or the one-click App-creation flow (until it does),
   * without hard-coding either state client-side. `slug` is public-safe —
   * it's the same string that appears in the App's install URL.
   */
  @Get("app-status")
  appStatus(): { configured: boolean; slug: string | null } {
    return {
      configured: this.config.features.githubAppEnabled,
      slug: this.config.env.GITHUB_APP_SLUG ?? null,
    };
  }

  @Post("webhook")
  async handleWebhook(@Req() req: RawBodyRequest<Request>): Promise<WebhookHandlingResult> {
    if (!this.config.features.githubAppEnabled) {
      throw new ServiceUnavailableException("GitHub App is not configured on this deployment");
    }
    if (!req.rawBody) {
      throw new BadRequestException("Missing request body");
    }

    const signature = req.headers["x-hub-signature-256"];
    const deliveryId = req.headers["x-github-delivery"];
    const eventName = req.headers["x-github-event"];

    if (typeof deliveryId !== "string") {
      throw new BadRequestException("Missing x-github-delivery header");
    }
    if (
      !verifyWebhookSignature(
        req.rawBody,
        typeof signature === "string" ? signature : undefined,
        this.config.env.GITHUB_WEBHOOK_SECRET ?? "",
      )
    ) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    if (await isDuplicateDelivery(this.deliveryStore, deliveryId)) {
      return { status: "duplicate-ignored" };
    }

    const payload: unknown = JSON.parse(req.rawBody.toString("utf8"));
    return this.webhookService.dispatch(
      typeof eventName === "string" ? eventName : undefined,
      payload,
    );
  }
}
