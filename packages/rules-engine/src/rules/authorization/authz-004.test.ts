import { describe, expect, it } from "vitest";
import { RuleEngine } from "../../engine/RuleEngine";

async function scan(source: string) {
  const engine = new RuleEngine();
  return engine.scanSources({
    sources: { "handler.ts": source },
    onlyRuleIds: ["SENTINEL-AUTHZ-004"],
  });
}

describe("SENTINEL-AUTHZ-004", () => {
  it("flags a branch that trusts a client-supplied role field", async () => {
    const result = await scan(`
      import { Router } from "express";
      const router = Router();
      router.post("/api/admin/reset", (req, res) => {
        if (req.body.role === "admin") {
          res.json({ ok: true });
        }
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe("SENTINEL-AUTHZ-004");
  });

  it("does not flag a branch on a server-derived session field", async () => {
    const result = await scan(`
      import { Router } from "express";
      const router = Router();
      router.post("/api/admin/reset", (req, res) => {
        if (req.session.user.role === "admin") {
          res.json({ ok: true });
        }
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag an unrelated conditional on request data", async () => {
    const result = await scan(`
      import { Router } from "express";
      const router = Router();
      router.get("/api/search", (req, res) => {
        if (req.query.term) {
          res.json({ results: [] });
        }
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(0);
  });
});
