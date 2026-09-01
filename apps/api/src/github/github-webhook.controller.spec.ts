import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { SentinelConfig } from "@sayan-sentinel/config";
import { GithubWebhookController } from "./github-webhook.controller";
import type { GithubWebhookService } from "./github-webhook.service";

const WEBHOOK_SECRET = "test-webhook-secret";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")}`;
}

/**
 * `@sayan-sentinel/github`'s barrel re-exports `GitHubAppClient`, which
 * imports `@octokit/app` — an ESM-only package. Real Node (22+) can
 * `require()` it natively, but Jest's own CJS module loader can't, so this
 * file mocks the package with faithful reimplementations of the two pure
 * functions the controller actually calls, rather than dragging the real
 * octokit import chain into ts-jest. `verify-signature.test.ts` and
 * `delivery-dedup.test.ts` in `packages/github` already cover the real
 * implementations directly (via vitest, which handles the ESM chain fine).
 */
jest.mock("@sayan-sentinel/github", () => ({
  verifyWebhookSignature: (
    payload: string | Buffer,
    signatureHeader: string | undefined | null,
    secret: string,
  ): boolean => {
    if (!signatureHeader) return false;
    const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
    const expectedBuffer = Buffer.from(expected, "utf8");
    const actualBuffer = Buffer.from(signatureHeader, "utf8");
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, actualBuffer);
  },
  isDuplicateDelivery: async (
    store: { hasSeen: (id: string) => Promise<boolean>; markSeen: (id: string) => Promise<void> },
    deliveryId: string,
  ): Promise<boolean> => {
    if (await store.hasSeen(deliveryId)) return true;
    await store.markSeen(deliveryId);
    return false;
  },
}));

interface DeliveryStore {
  hasSeen: (id: string) => Promise<boolean>;
  markSeen: (id: string) => Promise<void>;
}

function fakeRequest(body: string, headers: Record<string, string | undefined>) {
  return {
    rawBody: Buffer.from(body, "utf8"),
    headers,
  } as never;
}

function fakeConfig(githubAppEnabled: boolean): SentinelConfig {
  return {
    env: { GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET },
    features: {
      githubAppEnabled,
      aiEnabled: false,
      dynamicValidationEnabled: false,
      hostedMode: false,
    },
  } as unknown as SentinelConfig;
}

function fakeDeliveryStore(): DeliveryStore {
  const seen = new Set<string>();
  return {
    hasSeen: jest.fn(async (id: string) => seen.has(id)),
    markSeen: jest.fn(async (id: string) => {
      seen.add(id);
    }),
  };
}

function fakeWebhookService(): GithubWebhookService {
  return {
    dispatch: jest.fn().mockResolvedValue({ status: "ok" }),
  } as unknown as GithubWebhookService;
}

describe("GithubWebhookController.handleWebhook", () => {
  it("rejects with 503 when the GitHub App isn't configured", async () => {
    const controller = new GithubWebhookController(
      fakeWebhookService(),
      fakeConfig(false),
      fakeDeliveryStore(),
    );

    await expect(controller.handleWebhook(fakeRequest("{}", {}))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("rejects with 400 when the delivery id header is missing", async () => {
    const controller = new GithubWebhookController(
      fakeWebhookService(),
      fakeConfig(true),
      fakeDeliveryStore(),
    );

    await expect(
      controller.handleWebhook(fakeRequest("{}", { "x-hub-signature-256": sign("{}") })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects with 401 when the signature doesn't match the body", async () => {
    const controller = new GithubWebhookController(
      fakeWebhookService(),
      fakeConfig(true),
      fakeDeliveryStore(),
    );
    const req = fakeRequest("{}", {
      "x-hub-signature-256": "sha256=deadbeef",
      "x-github-delivery": "delivery-1",
      "x-github-event": "push",
    });

    await expect(controller.handleWebhook(req)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("dispatches to the service on a valid, first-time delivery", async () => {
    const webhookService = fakeWebhookService();
    const controller = new GithubWebhookController(
      webhookService,
      fakeConfig(true),
      fakeDeliveryStore(),
    );
    const body = JSON.stringify({ action: "created" });
    const req = fakeRequest(body, {
      "x-hub-signature-256": sign(body),
      "x-github-delivery": "delivery-1",
      "x-github-event": "installation",
    });

    const result = await controller.handleWebhook(req);

    expect(result).toEqual({ status: "ok" });
    expect(webhookService.dispatch).toHaveBeenCalledWith("installation", { action: "created" });
  });

  it("skips dispatch and returns duplicate-ignored for a redelivered delivery id", async () => {
    const webhookService = fakeWebhookService();
    const deliveryStore = fakeDeliveryStore();
    const controller = new GithubWebhookController(webhookService, fakeConfig(true), deliveryStore);
    const body = JSON.stringify({ action: "created" });
    const req = fakeRequest(body, {
      "x-hub-signature-256": sign(body),
      "x-github-delivery": "delivery-1",
      "x-github-event": "installation",
    });

    await controller.handleWebhook(req);
    const secondResult = await controller.handleWebhook(req);

    expect(secondResult).toEqual({ status: "duplicate-ignored" });
    expect(webhookService.dispatch).toHaveBeenCalledTimes(1);
  });
});
