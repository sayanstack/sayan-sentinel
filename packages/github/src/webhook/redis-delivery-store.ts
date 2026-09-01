import type { DeliveryStore } from "./delivery-dedup";

/**
 * The minimal shape this store needs from a Redis client — structurally
 * compatible with `ioredis`'s `Redis` instance (and any drop-in
 * replacement/mock) without depending on the `ioredis` package's types
 * directly, so this file stays testable with a plain fake.
 */
export interface RedisDeliveryStoreClient {
  exists(key: string): Promise<number>;
  set(key: string, value: string, mode: "EX", seconds: number): Promise<string | null>;
}

/** Comfortably covers GitHub's documented webhook retry window (it stops retrying well before 24h). */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

/**
 * Redis-backed `DeliveryStore` — the production-shaped alternative to
 * `InMemoryDeliveryStore` this module's own doc comment calls for, so
 * duplicate-delivery protection survives a process restart and works
 * correctly across multiple API instances behind a load balancer.
 */
export class RedisDeliveryStore implements DeliveryStore {
  constructor(
    private readonly client: RedisDeliveryStoreClient,
    private readonly ttlSeconds: number = DEFAULT_TTL_SECONDS,
    private readonly keyPrefix = "sentinel:github-webhook-delivery:",
  ) {}

  async hasSeen(deliveryId: string): Promise<boolean> {
    return (await this.client.exists(this.key(deliveryId))) > 0;
  }

  async markSeen(deliveryId: string): Promise<void> {
    await this.client.set(this.key(deliveryId), "1", "EX", this.ttlSeconds);
  }

  private key(deliveryId: string): string {
    return `${this.keyPrefix}${deliveryId}`;
  }
}
