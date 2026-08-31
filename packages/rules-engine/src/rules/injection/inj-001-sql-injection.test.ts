import { describe, expect, it } from "vitest";
import { RuleEngine } from "../../engine/RuleEngine";

async function scan(source: string) {
  const engine = new RuleEngine();
  return engine.scanSources({
    sources: { "handler.ts": source },
    onlyRuleIds: ["SENTINEL-INJ-001"],
  });
}

describe("SENTINEL-INJ-001", () => {
  it("flags untrusted input reaching a raw unsafe query", async () => {
    const result = await scan(`
      import { Router } from "express";
      import { prisma } from "./db";
      const router = Router();
      router.get("/api/search", async (req, res) => {
        const term = req.query.term;
        const rows = await prisma.$queryRawUnsafe(\`SELECT * FROM items WHERE name = '\${term}'\`);
        res.json(rows);
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(1);
  });

  it("does not flag an ordinary parameterized Prisma call", async () => {
    const result = await scan(`
      import { Router } from "express";
      import { prisma } from "./db";
      const router = Router();
      router.get("/api/search", async (req, res) => {
        const term = req.query.term;
        const rows = await prisma.item.findMany({ where: { name: term } });
        res.json(rows);
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(0);
  });
});
