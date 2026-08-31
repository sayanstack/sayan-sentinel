import { describe, expect, it } from "vitest";
import { RuleEngine } from "../../engine/RuleEngine";

async function scan(source: string) {
  const engine = new RuleEngine();
  return engine.scanSources({
    sources: { "handler.ts": source },
    onlyRuleIds: ["SENTINEL-FS-001"],
  });
}

describe("SENTINEL-FS-001", () => {
  it("flags untrusted input reaching fs.readFile", async () => {
    const result = await scan(`
      import { Router } from "express";
      import * as fs from "fs";
      const router = Router();
      router.get("/files/:name", (req, res) => {
        const name = req.params.name;
        fs.readFile(\`/data/uploads/\${name}\`, (err, data) => res.send(data));
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(1);
  });

  it("still flags after path.normalize alone, since it does not prove containment", async () => {
    const result = await scan(`
      import { Router } from "express";
      import * as fs from "fs";
      import * as path from "path";
      const router = Router();
      router.get("/files/:name", (req, res) => {
        const normalized = path.normalize(req.params.name);
        fs.readFile(\`/data/uploads/\${normalized}\`, (err, data) => res.send(data));
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(1);
  });
});
