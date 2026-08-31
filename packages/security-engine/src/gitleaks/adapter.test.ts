import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitleaksAdapter } from "./adapter";

const MISSING_BIN = "sentinel-test-nonexistent-gitleaks-binary";

describe("GitleaksAdapter", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-gitleaks-target-"));
  });

  afterEach(() => {
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  it("reports genuinely unavailable when the binary isn't installed", async () => {
    const adapter = new GitleaksAdapter({ bin: MISSING_BIN });
    const availability = await adapter.checkAvailability();

    expect(availability.available).toBe(false);
    expect(availability.reason).toContain(MISSING_BIN);
  });

  it("scan() returns 'unavailable', never a fake clean scan, when the binary is missing", async () => {
    const adapter = new GitleaksAdapter({ bin: MISSING_BIN });
    const outcome = await adapter.scan(targetDir);

    expect(outcome.status).toBe("unavailable");
  });
});
