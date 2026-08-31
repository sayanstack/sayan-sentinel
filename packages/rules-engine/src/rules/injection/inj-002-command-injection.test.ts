import { describe, expect, it } from "vitest";
import { RuleEngine } from "../../engine/RuleEngine";

async function scan(source: string) {
  const engine = new RuleEngine();
  return engine.scanSources({
    sources: { "handler.ts": source },
    onlyRuleIds: ["SENTINEL-INJ-002"],
  });
}

describe("SENTINEL-INJ-002", () => {
  it("flags untrusted input reaching child_process.exec", async () => {
    const result = await scan(`
      import { Router } from "express";
      import { exec } from "child_process";
      const router = Router();
      router.post("/api/ping", (req, res) => {
        const host = req.body.host;
        exec(\`ping -c 1 \${host}\`, (err, stdout) => res.send(stdout));
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(1);
  });

  it("does not flag when the value is numerically coerced first", async () => {
    const result = await scan(`
      import { Router } from "express";
      import { exec } from "child_process";
      const router = Router();
      router.post("/api/ping", (req, res) => {
        const count = Number(req.body.count);
        exec(\`ping -c \${count} localhost\`, (err, stdout) => res.send(stdout));
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(0);
  });
});
