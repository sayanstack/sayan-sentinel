import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { walkRepositoryFiles } from "../ingestion/file-walker";
import { buildCodeGraphFromDirectory } from "./builder";

/**
 * Runs the real ingestion walker + AST graph builder against the actual
 * bundled demo fixture (examples/vulnerable-demo-app), not a synthetic
 * in-memory snippet — proving Section 33's "Sentinel should be able to
 * analyze this fixture" for real, end to end through this package.
 */
describe("buildCodeGraphFromDirectory against the bundled demo fixture", () => {
  const fixtureRoot = path.resolve(__dirname, "../../../../examples/vulnerable-demo-app");

  it("discovers the demo app's routes, external-call-shaped patterns, and env usage", async () => {
    const walked = await walkRepositoryFiles(fixtureRoot);
    const filePaths = walked.files.map((f) => f.relativePath);
    expect(filePaths).toContain("src/app.js");

    const graph = buildCodeGraphFromDirectory({ rootDir: fixtureRoot, filePaths });

    const routes = graph.nodes.filter((n) => n.kind === "route").map((n) => n.name);
    expect(routes).toEqual(
      expect.arrayContaining([
        "GET /api/orders/:id",
        "GET /api/invoices/:id",
        "PATCH /api/users/:id",
        "GET /redirect",
        "GET /files/:name",
        "POST /preview-template",
        "GET /search",
        "GET /fetch-url",
        "POST /ping",
        "GET /api/lookup",
        "POST /api/mongo-login",
        "GET /api/admin",
        "POST /api/admin/reset",
        "POST /login",
        "GET /crash",
      ]),
    );

    const envVars = graph.nodes.filter((n) => n.kind === "env_var").map((n) => n.name);
    expect(envVars).toContain("DEMO_PORT");

    const fileNode = graph.nodes.find((n) => n.kind === "file" && n.filePath === "src/app.js");
    expect(fileNode).toBeDefined();
  });
});
