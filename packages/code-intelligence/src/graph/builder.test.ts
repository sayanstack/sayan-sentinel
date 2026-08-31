import { describe, expect, it } from "vitest";
import { buildCodeGraphFromSources } from "./builder";
import type { CodeGraph } from "./types";

function edgesOfKind(graph: CodeGraph, kind: string) {
  return graph.edges.filter((e) => e.kind === kind);
}

function nodesOfKind(graph: CodeGraph, kind: string) {
  return graph.nodes.filter((n) => n.kind === kind);
}

describe("buildCodeGraphFromSources", () => {
  it("registers a file node per source file", () => {
    const graph = buildCodeGraphFromSources({
      "src/a.ts": "export const a = 1;",
      "src/b.ts": "export const b = 2;",
    });

    const fileNames = nodesOfKind(graph, "file")
      .map((n) => n.filePath)
      .sort();
    expect(fileNames).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("creates an IMPORTS edge between two local files", () => {
    const graph = buildCodeGraphFromSources({
      "src/util.ts": "export function helper() { return 1; }",
      "src/main.ts": `import { helper } from "./util";\nhelper();`,
    });

    const importEdges = edgesOfKind(graph, "IMPORTS");
    const localImport = importEdges.find((e) => e.toNodeId.includes("src/util.ts"));
    expect(localImport).toBeDefined();
    expect(localImport?.fromNodeId).toContain("src/main.ts");
  });

  it("creates an external_module node and IMPORTS edge for a bare package specifier", () => {
    const graph = buildCodeGraphFromSources({
      "src/main.ts": `import axios from "axios";\nvoid axios;`,
    });

    const externalModules = nodesOfKind(graph, "external_module");
    expect(externalModules.map((n) => n.name)).toContain("axios");
    expect(edgesOfKind(graph, "IMPORTS").some((e) => e.toNodeId.endsWith(":axios"))).toBe(true);
  });

  it("registers named functions, arrow-function consts, classes, and methods", () => {
    const graph = buildCodeGraphFromSources({
      "src/things.ts": `
        function namedFn() { return 1; }
        const arrowFn = () => 2;
        class Widget {
          build() { return 3; }
        }
      `,
    });

    expect(
      nodesOfKind(graph, "function")
        .map((n) => n.name)
        .sort(),
    ).toEqual(["arrowFn", "namedFn"]);
    expect(nodesOfKind(graph, "class").map((n) => n.name)).toEqual(["Widget"]);
    expect(nodesOfKind(graph, "method").map((n) => n.name)).toEqual(["Widget.build"]);
  });

  it("detects an Express route and links it to the file", () => {
    const graph = buildCodeGraphFromSources({
      "src/server.ts": `
        const app = { get: (path, handler) => {} };
        app.get("/users", (req, res) => res.send("ok"));
      `,
    });

    const routes = nodesOfKind(graph, "route");
    expect(routes).toHaveLength(1);
    expect(routes[0]?.metadata).toMatchObject({
      framework: "express",
      httpMethod: "GET",
      path: "/users",
    });
    expect(edgesOfKind(graph, "EXPOSES_ROUTE")).toHaveLength(1);
  });

  it("detects a NestJS controller route with a combined prefix + sub-path", () => {
    const graph = buildCodeGraphFromSources({
      "src/users.controller.ts": `
        @Controller("users")
        class UsersController {
          @Get(":id")
          getUser() { return {}; }
        }
      `,
    });

    const routes = nodesOfKind(graph, "route");
    expect(routes.map((n) => n.name)).toContain("GET /users/:id");
  });

  it("detects process.env.X and process.env['X'] reads, attributed to the containing function", () => {
    const graph = buildCodeGraphFromSources({
      "src/config.ts": `
        function loadConfig() {
          const key = process.env.API_KEY;
          const other = process.env["OTHER_VAR"];
          return { key, other };
        }
      `,
    });

    const envVars = nodesOfKind(graph, "env_var")
      .map((n) => n.name)
      .sort();
    expect(envVars).toEqual(["API_KEY", "OTHER_VAR"]);

    const readEdges = edgesOfKind(graph, "READS_FROM");
    expect(readEdges.every((e) => e.fromNodeId.includes("loadConfig"))).toBe(true);
  });

  it("detects an outbound fetch call as CALLS_EXTERNAL", () => {
    const graph = buildCodeGraphFromSources({
      "src/client.ts": `
        async function getData() {
          return fetch("https://api.example.com/data");
        }
      `,
    });

    const endpoints = nodesOfKind(graph, "external_endpoint");
    expect(endpoints.map((n) => n.name)).toContain("https://api.example.com/data");
    expect(edgesOfKind(graph, "CALLS_EXTERNAL")).toHaveLength(1);
  });

  it("detects a Prisma read as QUERIES + READS_FROM and a Prisma write as QUERIES + WRITES_TO", () => {
    const graph = buildCodeGraphFromSources({
      "src/repo.ts": `
        class UserRepo {
          list() { return prisma.user.findMany(); }
          add() { return prisma.user.create({ data: {} }); }
        }
      `,
    });

    const dbModels = nodesOfKind(graph, "db_model");
    expect(dbModels.map((n) => n.name)).toEqual(["user"]);
    expect(edgesOfKind(graph, "QUERIES")).toHaveLength(2);
    expect(edgesOfKind(graph, "READS_FROM").some((e) => e.fromNodeId.includes("list"))).toBe(true);
    expect(edgesOfKind(graph, "WRITES_TO").some((e) => e.fromNodeId.includes("add"))).toBe(true);
  });

  it("classifies an auth-named guard as AUTHENTICATES and a role guard as AUTHORIZES", () => {
    const graph = buildCodeGraphFromSources({
      "src/protected.controller.ts": `
        class ProtectedController {
          @UseGuards(JwtAuthGuard)
          getSecret() { return "secret"; }

          @UseGuards(RolesGuard)
          adminOnly() { return "admin"; }
        }
      `,
    });

    expect(edgesOfKind(graph, "AUTHENTICATES")).toHaveLength(1);
    expect(edgesOfKind(graph, "AUTHORIZES")).toHaveLength(1);

    const guardNames = nodesOfKind(graph, "guard")
      .map((n) => n.name)
      .sort();
    expect(guardNames).toEqual(["JwtAuthGuard", "RolesGuard"]);
  });
});
