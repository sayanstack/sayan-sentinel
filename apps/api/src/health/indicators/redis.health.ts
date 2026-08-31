import { Inject, Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import type { SentinelConfig } from "@sayan-sentinel/config";
import Redis from "ioredis";
import { SENTINEL_CONFIG } from "../../config/sentinel-config.constants";

/**
 * Opens a short-lived connection per check rather than holding a persistent
 * client, so a Redis outage produces one clean "down" result per health
 * check instead of a background client endlessly retrying and spamming logs.
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(SENTINEL_CONFIG) private readonly config: SentinelConfig,
  ) {}

  async check<const Key extends string>(key: Key) {
    const indicator = this.healthIndicatorService.check(key);
    const client = new Redis(this.config.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 2000,
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
    });

    try {
      await client.connect();
      await client.ping();
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : "unknown redis error",
      });
    } finally {
      client.disconnect();
    }
  }
}
