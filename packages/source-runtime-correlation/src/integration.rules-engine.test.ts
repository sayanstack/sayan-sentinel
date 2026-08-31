import { describe, expect, it } from "vitest";
import {
  extractRouteHandlers,
  loadProjectFromSources,
  type RouteHandler,
} from "@sayan-sentinel/rules-engine";
import { correlateRuntimeRequest } from "./match";
import type { NormalizedRoute } from "./types";

/**
 * `RouteHandler.path`/`.httpMethod` are already normalized to this
 * package's `{param}` convention by the Rules Engine's own route
 * extractor — this is the trivial mapping a real integration (e.g. a
 * future worker pipeline step) would perform, proven end-to-end here
 * rather than asserted.
 */
function toNormalizedRoute(handler: RouteHandler, filePath: string): NormalizedRoute {
  return {
    method: handler.httpMethod,
    pattern: handler.path,
    origin: "source",
    metadata: { filePath, line: handler.line, framework: handler.framework },
  };
}

describe("source-runtime-correlation + @sayan-sentinel/rules-engine integration", () => {
  it("correlates a runtime request against an Express route extracted from real source", () => {
    const { sourceFiles } = loadProjectFromSources({
      "handler.ts": `
        import { Router } from "express";
        const router = Router();
        router.get("/api/accounts/:accountId", (req, res) => {
          res.json({ ok: true });
        });
        export default router;
      `,
    });
    const handlers = extractRouteHandlers(sourceFiles[0]!, "handler.ts");
    const sourceRoutes = handlers.map((h) => toNormalizedRoute(h, "handler.ts"));

    const result = correlateRuntimeRequest("GET", "/api/accounts/42", sourceRoutes);
    expect(result.match?.params).toEqual({ accountId: "42" });
    expect(result.match?.route.metadata).toMatchObject({
      filePath: "handler.ts",
      framework: "express",
    });
  });

  it("correlates a runtime request against a NestJS controller method extracted from real source", () => {
    const { sourceFiles } = loadProjectFromSources({
      "accounts.controller.ts": `
        import { Controller, Get, Param } from "@nestjs/common";
        @Controller("accounts")
        class AccountsController {
          @Get(":id")
          getAccount(@Param("id") id: string) {
            return { id };
          }
        }
      `,
    });
    const handlers = extractRouteHandlers(sourceFiles[0]!, "accounts.controller.ts");
    const sourceRoutes = handlers.map((h) => toNormalizedRoute(h, "accounts.controller.ts"));

    const result = correlateRuntimeRequest("GET", "/accounts/99", sourceRoutes);
    expect(result.match?.params).toEqual({ id: "99" });
  });

  it("correlates a runtime request against a Next.js App Router handler extracted from real source", () => {
    const { sourceFiles } = loadProjectFromSources({
      "app/api/users/[id]/route.ts": `
        export async function GET(request: Request, { params }: { params: { id: string } }) {
          return Response.json({ id: params.id });
        }
      `,
    });
    const handlers = extractRouteHandlers(sourceFiles[0]!, "app/api/users/[id]/route.ts");
    const sourceRoutes = handlers.map((h) => toNormalizedRoute(h, "app/api/users/[id]/route.ts"));

    const result = correlateRuntimeRequest("GET", "/api/users/7", sourceRoutes);
    expect(result.match?.params).toEqual({ id: "7" });
  });

  it("reports no correlation for a runtime path with no matching source route", () => {
    const { sourceFiles } = loadProjectFromSources({
      "handler.ts": `
        import { Router } from "express";
        const router = Router();
        router.get("/api/accounts/:accountId", (req, res) => res.json({}));
        export default router;
      `,
    });
    const handlers = extractRouteHandlers(sourceFiles[0]!, "handler.ts");
    const sourceRoutes = handlers.map((h) => toNormalizedRoute(h, "handler.ts"));

    const result = correlateRuntimeRequest("GET", "/api/widgets/1", sourceRoutes);
    expect(result.match).toBeUndefined();
  });
});
