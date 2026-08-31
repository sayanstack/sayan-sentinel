import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // git-ingestor.test.ts shells out to real git processes and can run
    // slower than the 5s default under concurrent load (e.g. the whole
    // workspace's tests running in parallel) — this isn't inherent
    // slowness in the test itself, just headroom for contention.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
