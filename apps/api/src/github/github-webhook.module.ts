import { Logger, Module, type Provider } from "@nestjs/common";
import type { SentinelConfig } from "@sayan-sentinel/config";
import {
  GitHubAppClient,
  RedisDeliveryStore,
  resolvePrivateKey,
  validatePrivateKey,
} from "@sayan-sentinel/github";
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
    const logger = new Logger("GithubAppClientFactory");
    if (!config.features.githubAppEnabled) return null;
    const privateKey = resolvePrivateKey({
      inline: config.env.GITHUB_APP_PRIVATE_KEY,
      path: config.env.GITHUB_APP_PRIVATE_KEY_PATH,
    });
    if (!privateKey) return null;

    // Logged once at boot, never the key itself — a real "Invalid
    // keyData" only surfaces later, deep inside octokit, the first time
    // something actually needs a JWT signed with this key (`App`'s own
    // constructor never parses it), so this is the only way to get an
    // early, actionable signal instead of waiting for a webhook to fail.
    const diagnostics = validatePrivateKey(privateKey);
    if (!diagnostics.valid) {
      logger.error(`GITHUB_APP_PRIVATE_KEY failed to parse: ${diagnostics.detail}`);
      logger.error(`Key shape: ${diagnostics.shape}`);
    } else {
      logger.log(`GITHUB_APP_PRIVATE_KEY parsed OK (${diagnostics.shape})`);
    }

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
