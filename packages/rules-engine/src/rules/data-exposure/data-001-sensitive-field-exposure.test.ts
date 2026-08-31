import { describe, expect, it } from "vitest";
import { RuleEngine } from "../../engine/RuleEngine";

async function scan(source: string) {
  const engine = new RuleEngine();
  return engine.scanSources({
    sources: { "handler.ts": source },
    onlyRuleIds: ["SENTINEL-DATA-001"],
  });
}

describe("SENTINEL-DATA-001", () => {
  it("flags a response payload that includes a password field", async () => {
    const result = await scan(`
      import { Router } from "express";
      import { prisma } from "./db";
      const router = Router();
      router.get("/api/users/:id", async (req, res) => {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        res.json({ id: user.id, email: user.email, password: user.password });
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.evidence.find((e) => e.label === "Field")?.detail).toBe("password");
  });

  it("does not flag a response payload with an explicit safe projection", async () => {
    const result = await scan(`
      import { Router } from "express";
      import { prisma } from "./db";
      const router = Router();
      router.get("/api/users/:id", async (req, res) => {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        res.json({ id: user.id, email: user.email });
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(0);
  });
});
