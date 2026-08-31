import { describe, expect, it } from "vitest";
import { checkBinaryAvailability, runScannerProcess } from "./process";

// Use the current Node binary as a real, always-present executable so
// these tests don't depend on any scanner actually being installed.
const NODE_BIN = process.execPath;

describe("runScannerProcess", () => {
  it("returns 'ok' with stdout even when the process exits non-zero", async () => {
    const outcome = await runScannerProcess(
      NODE_BIN,
      ["-e", "console.log('partial-output'); process.exit(1)"],
      { timeoutMs: 10_000 },
    );

    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.result.stdout).toContain("partial-output");
      expect(outcome.result.exitCode).toBe(1);
    }
  });

  it("returns 'not_found' for a genuinely nonexistent binary", async () => {
    const outcome = await runScannerProcess("sentinel-test-nonexistent-binary-xyz", [], {
      timeoutMs: 5000,
    });
    expect(outcome.kind).toBe("not_found");
  });

  it("returns 'timeout' when the process outlives the timeout budget", async () => {
    const outcome = await runScannerProcess(NODE_BIN, ["-e", "setTimeout(() => {}, 10000)"], {
      timeoutMs: 300,
    });
    expect(outcome.kind).toBe("timeout");
  }, 10_000);
});

describe("checkBinaryAvailability", () => {
  it("reports available with a version string for a real binary", async () => {
    const availability = await checkBinaryAvailability(NODE_BIN, ["--version"]);
    expect(availability.available).toBe(true);
    expect(availability.version).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it("reports unavailable with a clear reason for a nonexistent binary", async () => {
    const availability = await checkBinaryAvailability("sentinel-test-nonexistent-binary-xyz");
    expect(availability.available).toBe(false);
    expect(availability.reason).toContain("sentinel-test-nonexistent-binary-xyz");
  });
});
