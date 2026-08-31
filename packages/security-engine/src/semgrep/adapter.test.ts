import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SemgrepAdapter } from "./adapter";

const MISSING_BIN = "sentinel-test-nonexistent-semgrep-binary";

describe("SemgrepAdapter", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-semgrep-target-"));
  });

  afterEach(() => {
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  it("reports genuinely unavailable — never a fabricated version — when the binary isn't installed", async () => {
    const adapter = new SemgrepAdapter({ bin: MISSING_BIN });
    const availability = await adapter.checkAvailability();

    expect(availability.available).toBe(false);
    expect(availability.version).toBeUndefined();
    expect(availability.reason).toContain(MISSING_BIN);
  });

  it("scan() returns an 'unavailable' outcome, never a fake 'completed' result, when the binary is missing", async () => {
    const adapter = new SemgrepAdapter({ bin: MISSING_BIN });
    const outcome = await adapter.scan(targetDir);

    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(outcome.reason).toContain(MISSING_BIN);
    }
  });
});
