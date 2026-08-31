import { describe, expect, it } from "vitest";
import { RuleEngine } from "./RuleEngine";

const VULNERABLE_SOURCE = `
  import { Router } from "express";
  import { prisma } from "./db";
  const router = Router();
  router.get("/api/accounts/:accountId", async (req, res) => {
    const accountId = req.params.accountId;
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    res.json(account);
  });
  export default router;
`;

describe("RuleRunner", () => {
  it("does not suppress a finding when the ignore comment is far from the flagged line", async () => {
    const suppressed = VULNERABLE_SOURCE.replace(
      "  router.get(",
      "  // sentinel-ignore SENTINEL-AUTHZ-001 -- reviewed, this endpoint is intentionally public in this fixture\n  router.get(",
    );

    const engine = new RuleEngine();
    const result = await engine.scanSources({
      sources: { "handler.ts": suppressed },
      onlyRuleIds: ["SENTINEL-AUTHZ-001"],
    });

    // The comment is far from the finding's own line, so it should NOT suppress anything —
    // this asserts suppression is line-scoped, not file-wide.
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.suppressedCount).toBe(0);
  });

  it("suppresses a finding when the ignore comment sits directly above the flagged line", async () => {
    const withSuppression = VULNERABLE_SOURCE.replace(
      "    const account = await prisma.account.findUnique({ where: { id: accountId } });",
      "    // sentinel-ignore SENTINEL-AUTHZ-001 -- reviewed and accepted for this fixture\n    const account = await prisma.account.findUnique({ where: { id: accountId } });",
    );

    const engine = new RuleEngine();
    const result = await engine.scanSources({
      sources: { "handler.ts": withSuppression },
      onlyRuleIds: ["SENTINEL-AUTHZ-001"],
    });

    expect(result.findings).toHaveLength(0);
    expect(result.suppressedCount).toBe(1);
  });

  it("does not suppress without a reason", async () => {
    const withBareIgnore = VULNERABLE_SOURCE.replace(
      "    const account = await prisma.account.findUnique({ where: { id: accountId } });",
      "    // sentinel-ignore SENTINEL-AUTHZ-001\n    const account = await prisma.account.findUnique({ where: { id: accountId } });",
    );

    const engine = new RuleEngine();
    const result = await engine.scanSources({
      sources: { "handler.ts": withBareIgnore },
      onlyRuleIds: ["SENTINEL-AUTHZ-001"],
    });

    expect(result.findings).toHaveLength(1);
    expect(result.suppressedCount).toBe(0);
  });

  it("applies a config severity override", async () => {
    const engine = new RuleEngine();
    const result = await engine.scanSources({
      sources: { "handler.ts": VULNERABLE_SOURCE },
      onlyRuleIds: ["SENTINEL-AUTHZ-001"],
      config: { rules: { "SENTINEL-AUTHZ-001": { severity: "low" } } },
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("low");
  });

  it("disables a rule via config", async () => {
    const engine = new RuleEngine();
    const result = await engine.scanSources({
      sources: { "handler.ts": VULNERABLE_SOURCE },
      onlyRuleIds: ["SENTINEL-AUTHZ-001"],
      config: { rules: { "SENTINEL-AUTHZ-001": { enabled: false } } },
    });

    expect(result.findings).toHaveLength(0);
    expect(result.rulesExecuted).toHaveLength(0);
  });
});
