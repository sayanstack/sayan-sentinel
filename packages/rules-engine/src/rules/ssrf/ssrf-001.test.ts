import { describe, expect, it } from "vitest";
import { RuleEngine } from "../../engine/RuleEngine";

async function scan(source: string) {
  const engine = new RuleEngine();
  return engine.scanSources({
    sources: { "handler.ts": source },
    onlyRuleIds: ["SENTINEL-SSRF-001"],
  });
}

describe("SENTINEL-SSRF-001", () => {
  it("flags untrusted input controlling an outbound fetch destination", async () => {
    const result = await scan(`
      import { Router } from "express";
      const router = Router();
      router.post("/api/webhook-test", async (req, res) => {
        const target = req.body.url;
        const response = await fetch(target);
        res.json(await response.json());
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(1);
  });

  it("does not flag a request to a hardcoded destination", async () => {
    const result = await scan(`
      import { Router } from "express";
      const router = Router();
      router.get("/api/status", async (req, res) => {
        const response = await fetch("https://status.internal.example.com/health");
        res.json(await response.json());
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(0);
  });
});
