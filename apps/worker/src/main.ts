import { loadConfig } from "@sayan-sentinel/config";
import { parseRedisConnection } from "@sayan-sentinel/queue";
import { startScanWorker } from "./queue/scan-worker";

function main(): void {
  const config = loadConfig(process.env);
  const connection = parseRedisConnection(config.env.REDIS_URL);

  const worker = startScanWorker(config, connection);

  worker.on("completed", (job) => {
    console.log(
      JSON.stringify({ event: "scan.completed", jobId: job.id, scanId: job.data.scanId }),
    );
  });
  worker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({
        event: "scan.failed",
        jobId: job?.id,
        scanId: job?.data.scanId,
        error: error.message,
      }),
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
