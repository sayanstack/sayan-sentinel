import { loadConfig } from "@sayan-sentinel/config";
import type { ConnectionOptions } from "bullmq";
import { startScanWorker } from "./queue/scan-worker";

/** Parsed manually rather than passed as a raw URL string, to avoid depending on exactly which connection-string forms a given BullMQ/ioredis version accepts. */
function parseRedisConnection(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
  };
}

function main(): void {
  const config = loadConfig(process.env);
  const connection = parseRedisConnection(config.env.REDIS_URL);

  const worker = startScanWorker(config, connection);

  worker.on("completed", (job) => {
    console.log(JSON.stringify({ event: "scan.completed", jobId: job.id, scanId: job.data.scanId }));
  });
  worker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({ event: "scan.failed", jobId: job?.id, scanId: job?.data.scanId, error: error.message }),
    );
  });

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();
