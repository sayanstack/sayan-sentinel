import type { ConnectionOptions } from "bullmq";

/**
 * Parsed manually rather than passed as a raw URL string, to avoid
 * depending on exactly which connection-string forms a given
 * BullMQ/ioredis version accepts. Shared by both the producer side
 * (`apps/api`) and the consumer side (`apps/worker`) so their Redis
 * connections can never silently drift apart.
 */
export function parseRedisConnection(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
  };
}
