import { afterEach, describe, expect, it } from "vitest";
import type { Queue } from "bullmq";
import { createScanQueue } from "./scan-queue";
import { SCAN_QUEUE_NAME } from "./queue-names";
import type { ScanJobData } from "./queue-names";

describe("createScanQueue", () => {
  let queue: Queue<ScanJobData> | undefined;

  afterEach(async () => {
    await queue?.close();
    queue = undefined;
  });

  it("creates a queue bound to the shared scan queue name", () => {
    // No live Redis in this environment — BullMQ/ioredis connect lazily in
    // the background and retry on failure rather than throwing here, so
    // constructing the Queue is safe to assert on without a real server.
    queue = createScanQueue({ host: "127.0.0.1", port: 1 });
    expect(queue.name).toBe(SCAN_QUEUE_NAME);
  });
});
