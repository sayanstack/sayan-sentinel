import { Module, type Provider } from "@nestjs/common";
import type { SentinelConfig } from "@sayan-sentinel/config";
import { GitHubAppClient, RedisDeliveryStore, resolvePrivateKey } from "@sayan-sentinel/github";
import { createScanQueue, parseRedisConnection } from "@sayan-sentinel/queue";
import Redis from "ioredis";
import { SENTINEL_CONFIG } from "../config/sentinel-config.constants";
import { GithubWebhookController } from "./github-webhook.controller";
import { GithubWebhookService } from "./github-webhook.service";
import { GITHUB_APP_CLIENT, SCAN_QUEUE, WEBHOOK_DELIVERY_STORE } from "./github.constants";

const githubAppClientProvider: Provider = {
  provide: GITHUB_APP_CLIENT,
  inject: [SENTINEL_CONFIG],
  useFactory: (config: SentinelConfig): GitHubAppClient | null => {
    if (!config.features.githubAppEnabled) return null;
    const privateKey = resolvePrivateKey({
      inline: config.env.GITHUB_APP_PRIVATE_KEY,
      path: config.env.GITHUB_APP_PRIVATE_KEY_PATH,
    });
    if (!privateKey) return null;
    try {
      return new GitHubAppClient({
        appId: config.env.GITHUB_APP_ID!,
        privateKey,
        webhookSecret: config.env.GITHUB_WEBHOOK_SECRET!,
      });
    } catch {
      // Env vars present but e.g. the key is malformed — degrade to
      // "not configured" rather than crashing the API.
      return null;
    }
  },
};

const scanQueueProvider: Provider = {
  provide: SCAN_QUEUE,
  inject: [SENTINEL_CONFIG],
  useFactory: (config: SentinelConfig) =>
    createScanQueue(parseRedisConnection(config.env.REDIS_URL)),
};

const deliveryStoreProvider: Provider = {
  provide: WEBHOOK_DELIVERY_STORE,
  inject: [SENTINEL_CONFIG],
  useFactory: (config: SentinelConfig) => {
    // ioredis connects lazily and retries in the background rather than
    // throwing here, so a Redis outage surfaces as a failed webhook
    // request (via the health check's own indicator), not a boot crash.
    const client = new Redis(config.env.REDIS_URL, { maxRetriesPerRequest: null });
    return new RedisDeliveryStore(client);
  },
};

@Module({
  controllers: [GithubWebhookController],
  providers: [
    GithubWebhookService,
    githubAppClientProvider,
    scanQueueProvider,
    deliveryStoreProvider,
  ],
})
export class GithubWebhookModule {}
