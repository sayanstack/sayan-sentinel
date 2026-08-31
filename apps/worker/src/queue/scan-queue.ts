import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { SCAN_QUEUE_NAME, type ScanJobData } from "./queue-names";

/**
 * The producer-side queue handle — `apps/api` (once it wires up
 * scan-triggering endpoints/webhooks) enqueues jobs here; this worker
 * process consumes them. Genuinely requires a reachable Redis to do
 * anything — this machine has neither Docker nor a local Redis install,
 * so this has not been exercised against a live queue, matching every
 * other "needs real infra" honesty note in this repository.
 */
export function createScanQueue(connection: ConnectionOptions): Queue<ScanJobData> {
  return new Queue<ScanJobData>(SCAN_QUEUE_NAME, { connection });
}
