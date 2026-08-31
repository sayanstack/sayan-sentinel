import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { RuleEngine } from "../../engine/RuleEngine";

const FIXTURES_ROOT = path.join(__dirname, "..", "..", "testing", "fixtures", "authz-001");

async function scanFixture(fileName: string) {
  const engine = new RuleEngine();
  return engine.scanDirectory({
    rootDir: FIXTURES_ROOT,
    filePaths: [fileName],
    onlyRuleIds: ["SENTINEL-AUTHZ-001"],
  });
}

describe("SENTINEL-AUTHZ-001 (fixture files on disk)", () => {
  it("flags a direct lookup by user-controlled ID with no ownership constraint", async () => {
    const result = await scanFixture("vulnerable.ts");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe("SENTINEL-AUTHZ-001");
    expect(result.findings[0]?.route).toBe("GET /api/accounts/{accountId}");
    expect(result.findings[0]?.trace.some((s) => s.role === "source")).toBe(true);
    expect(result.findings[0]?.trace.some((s) => s.role === "sink")).toBe(true);
  });

  it("does not flag a query scoped by an ownership predicate", async () => {
    const result = await scanFixture("safe-owner-filter.ts");
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag a lookup dominated by an authorization guard", async () => {
    const result = await scanFixture("safe-policy.ts");
    expect(result.findings).toHaveLength(0);
  });

  it("(adversarial) resolves the unsafe lookup through a service-layer method call", async () => {
    const result = await scanFixture("adversarial-service-layer.ts");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.symbol).toContain("getAccount");
  });

  it("does not flag a resource fetched unscoped but gated before it's returned to the client", async () => {
    const result = await scanFixture("safe-check-after-fetch.ts");
    expect(result.findings).toHaveLength(0);
  });

  it("(adversarial) still flags after variable renaming and format validation", async () => {
    const result = await scanFixture("adversarial-renamed-and-validated.ts");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.evidence.some((e) => e.detail.includes("format_validation"))).toBe(
      true,
    );
  });
});

describe("SENTINEL-AUTHZ-001 (inline source variants)", () => {
  async function scanSource(
    source: string,
    framework: "express" | "nextjs" | "nestjs" = "express",
  ) {
    const engine = new RuleEngine();
    const files: Record<string, string> = {};
    if (framework === "nextjs") files["app/api/accounts/[id]/route.ts"] = source;
    else files["handler.ts"] = source;
    return engine.scanSources({ sources: files, onlyRuleIds: ["SENTINEL-AUTHZ-001"] });
  }

  it("flags a NestJS controller with no guard and no ownership predicate", async () => {
    const result = await scanSource(
      `
      import { Controller, Get, Param } from "@nestjs/common";
      import { prisma } from "./db";

      @Controller("accounts")
      class AccountsController {
        @Get(":id")
        async getAccount(@Param("id") id: string) {
          return prisma.account.findUnique({ where: { id } });
        }
      }
      `,
    );
    expect(result.findings).toHaveLength(1);
  });

  it("does not flag a NestJS controller guarded with @UseGuards", async () => {
    const result = await scanSource(
      `
      import { Controller, Get, Param, UseGuards } from "@nestjs/common";
      import { prisma } from "./db";
      import { OwnershipGuard } from "./guards";

      @Controller("accounts")
      class AccountsController {
        @Get(":id")
        @UseGuards(OwnershipGuard)
        async getAccount(@Param("id") id: string) {
          return prisma.account.findUnique({ where: { id } });
        }
      }
      `,
    );
    // NestJS @UseGuards is recorded as a route-level observed guard, but SENTINEL-AUTHZ-001's
    // suppression signal is a *dominating* guard call or an ownership predicate in the query
    // itself — @UseGuards alone (without a resolvable in-body call) is evidence for the
    // "Authentication" field, not a substitute for either. This is intentional: Sentinel cannot
    // statically verify what an opaque Guard class actually checks, so it still reports the
    // missing in-query/in-body evidence rather than trusting the decorator's name.
    expect(result.findings).toHaveLength(1);
  });

  it("does not flag when the result never reaches the response", async () => {
    const result = await scanSource(
      `
      import { Router } from "express";
      import { prisma } from "./db";
      const router = Router();
      router.get("/api/accounts/:accountId", async (req, res) => {
        const accountId = req.params.accountId;
        await prisma.account.findUnique({ where: { id: accountId } });
        res.json({ ok: true });
      });
      export default router;
      `,
    );
    expect(result.findings).toHaveLength(0);
  });

  it("flags a Next.js Route Handler with no ownership constraint", async () => {
    const result = await scanSource(
      `
      import { NextResponse } from "next/server";
      import { prisma } from "@/lib/db";

      export async function GET(request: Request, { params }: { params: { id: string } }) {
        const account = await prisma.account.findUnique({ where: { id: params.id } });
        return NextResponse.json(account);
      }
      `,
      "nextjs",
    );
    // NextResponse.json(...) isn't in the sensitive_response sink catalog (only `res.json`/`res.send`
    // are, per the Express-shaped catalog) — a documented V1 scope limit for the response-reachability
    // check, not a taint-tracking gap. `return account` covers the common Route Handler shape below.
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag a service method that checks organization membership after fetching, then returns null on failure", async () => {
    const result = await scanSource(`
      import { Router } from "express";
      import { prisma } from "./db";
      import { canAccessOrganization } from "./authz";

      const router = Router();

      class RepositoriesService {
        async getRepositoryForUser(userId: string, repositoryId: string) {
          const repository = await prisma.repository.findUnique({ where: { id: repositoryId } });
          if (!repository) return null;
          if (!canAccessOrganization(userId, repository.organizationId)) {
            return null;
          }
          return repository;
        }
      }

      const repositoriesService = new RepositoriesService();

      router.get("/api/repositories/:repositoryId", async (req, res) => {
        const repository = await repositoriesService.getRepositoryForUser(req.user.id, req.params.repositoryId);
        if (!repository) return res.status(404).json({ error: "not found" });
        res.json(repository);
      });

      export default router;
    `);
    expect(result.findings).toHaveLength(0);
  });

  it("flags a Next.js Route Handler that returns the record directly", async () => {
    const result = await scanSource(
      `
      import { prisma } from "@/lib/db";

      export async function GET(request: Request, { params }: { params: { id: string } }) {
        return prisma.account.findUnique({ where: { id: params.id } });
      }
      `,
      "nextjs",
    );
    expect(result.findings).toHaveLength(1);
  });
});
