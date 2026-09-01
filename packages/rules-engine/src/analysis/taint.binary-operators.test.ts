import { describe, expect, it } from "vitest";
import { RuleEngine } from "../engine/RuleEngine";

async function scanSsrf(source: string) {
  const engine = new RuleEngine();
  return engine.scanSources({
    sources: { "handler.ts": source },
    onlyRuleIds: ["SENTINEL-SSRF-001"],
  });
}

/**
 * Discovered while building the expanded `examples/vulnerable-demo-app`
 * fixture: `req.query.url || ""` (an extremely common idiomatic default
 * -value pattern) silently defeated every taint-sink rule, since
 * `resolveExpressionTaint`'s binary-expression handling only recognized
 * `+` (string concatenation) — not `||`/`??`. A route reading a param with
 * `|| "default"` before using it in an outbound request, shell command, or
 * file path evaded detection entirely. Fixed in `taint.ts` by extending
 * propagation to `||`/`??`, on the basis that the left operand's tainted
 * value flows through unchanged whenever it's actually present.
 */
describe("taint propagation through || and ??", () => {
  it('still flags a tainted value behind a `|| "default"` fallback', async () => {
    const result = await scanSsrf(`
      import { Router } from "express";
      const router = Router();
      router.get("/fetch-url", (req, res) => {
        const target = req.query.url || "";
        fetch(target);
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(1);
  });

  it('still flags a tainted value behind a `?? "default"` fallback', async () => {
    const result = await scanSsrf(`
      import { Router } from "express";
      const router = Router();
      router.get("/fetch-url", (req, res) => {
        const target = req.query.url ?? "";
        fetch(target);
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(1);
  });

  it("does not flag a genuinely hardcoded default with no tainted operand", async () => {
    const result = await scanSsrf(`
      import { Router } from "express";
      const router = Router();
      router.get("/fetch-url", (req, res) => {
        const target = "https://example.com" || "https://fallback.example.com";
        fetch(target);
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(0);
  });

  it("does not propagate taint through comparison/logical-AND operators", async () => {
    const result = await scanSsrf(`
      import { Router } from "express";
      const router = Router();
      router.get("/fetch-url", (req, res) => {
        const isSafe = req.query.url === "https://safe.example.com" && true;
        fetch("https://example.com");
        res.json({ isSafe });
      });
      export default router;
    `);
    expect(result.findings).toHaveLength(0);
  });
});
