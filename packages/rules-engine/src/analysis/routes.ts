import { Node, SyntaxKind, type CallExpression, type SourceFile } from "ts-morph";
import type { SupportedFramework } from "../engine/types";
import type { FunctionLikeDeclaration } from "./ast-types";
import { resolveReferenceDeclaration } from "./symbols";

export interface RouteHandler {
  framework: SupportedFramework;
  httpMethod: string;
  /** Normalized path, e.g. "/api/accounts/{id}" — `:id`/`[id]`/`[...id]` all become "{id}". */
  path: string;
  handler: FunctionLikeDeclaration;
  filePath: string;
  line: number;
  /** Guard/decorator names observed directly on the route (best-effort, name-based). */
  observedGuards: string[];
}

const EXPRESS_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
  "all",
]);
const NEST_METHOD_DECORATORS: Record<string, string> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Delete: "DELETE",
  Patch: "PATCH",
  Options: "OPTIONS",
  Head: "HEAD",
  All: "ALL",
};
const NEXT_HANDLER_EXPORTS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]);

function normalizeExpressPath(routePath: string): string {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function joinPath(...segments: string[]): string {
  return `/${segments.filter(Boolean).join("/")}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

/** Resolves the last argument of an Express-style route registration call to a function declaration. */
function resolveExpressHandler(call: CallExpression): FunctionLikeDeclaration | undefined {
  const args = call.getArguments();
  const last = args[args.length - 1];
  if (!last) return undefined;
  if (Node.isArrowFunction(last) || Node.isFunctionExpression(last)) return last;
  if (Node.isIdentifier(last)) return resolveReferenceDeclaration(last);
  return undefined;
}

function extractExpressRoutes(sourceFile: SourceFile): RouteHandler[] {
  const routes: RouteHandler[] = [];

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) continue;

    const methodName = expr.getName();
    if (!EXPRESS_METHODS.has(methodName)) continue;

    const receiverText = expr.getExpression().getText();
    if (!/^(app|router|server|api)\b/i.test(receiverText)) continue;

    const [pathArg] = call.getArguments();
    if (!pathArg || !Node.isStringLiteral(pathArg)) continue;

    const handler = resolveExpressHandler(call);
    if (!handler) continue;

    routes.push({
      framework: "express",
      httpMethod: methodName.toUpperCase(),
      path: normalizeExpressPath(pathArg.getLiteralValue()),
      handler,
      filePath: "",
      line: call.getStartLineNumber(),
      observedGuards: [],
    });
  }

  return routes;
}

function decoratorArgumentGuards(target: {
  getDecorator(name: string): Node | undefined;
}): string[] {
  const decorator = target.getDecorator("UseGuards");
  if (!decorator || !Node.isDecorator(decorator)) return [];
  return (
    decorator
      .getCallExpression()
      ?.getArguments()
      .map((arg) => arg.getText()) ?? []
  );
}

function extractNestRoutes(sourceFile: SourceFile): RouteHandler[] {
  const routes: RouteHandler[] = [];

  for (const cls of sourceFile.getClasses()) {
    const controllerDecorator = cls.getDecorator("Controller");
    if (!controllerDecorator) continue;

    const [prefixArg] = controllerDecorator.getArguments();
    const prefix = prefixArg && Node.isStringLiteral(prefixArg) ? prefixArg.getLiteralValue() : "";
    const classGuards = decoratorArgumentGuards(cls);

    for (const method of cls.getMethods()) {
      for (const [decoratorName, httpMethod] of Object.entries(NEST_METHOD_DECORATORS)) {
        const decorator = method.getDecorator(decoratorName);
        if (!decorator) continue;

        const [subPathArg] = decorator.getArguments();
        const subPath =
          subPathArg && Node.isStringLiteral(subPathArg) ? subPathArg.getLiteralValue() : "";
        const fullPath = normalizeExpressPath(joinPath(prefix, subPath));
        const methodGuards = decoratorArgumentGuards(method);

        routes.push({
          framework: "nestjs",
          httpMethod,
          path: fullPath,
          handler: method,
          filePath: "",
          line: method.getStartLineNumber(),
          observedGuards: [...classGuards, ...methodGuards],
        });
      }
    }
  }

  return routes;
}

/**
 * Derives a normalized route path from a Next.js App Router file path, e.g.
 * `app/api/accounts/[id]/route.ts` -> `/api/accounts/{id}`. Route groups
 * `(group)` are stripped (they don't appear in the URL); `[...slug]` and
 * `[[...slug]]` catch-all segments collapse to `{slug}` — an approximation
 * documented as such, since Sentinel does static-approximation route
 * matching rather than executing the Next.js router.
 */
export function nextAppRouterPathFromFile(relativePath: string): string | undefined {
  const normalized = relativePath.replace(/\\/g, "/");
  const match = normalized.match(/(^|\/)app\/(.*)\/route\.[tj]sx?$/);
  const captured = match?.[2];
  if (!captured) return undefined;

  const segments = captured
    .split("/")
    .filter((segment) => segment && !/^\(.*\)$/.test(segment))
    .map((segment) => segment.replace(/^\[\.\.\.(.+)\]$/, "{$1}").replace(/^\[(.+)\]$/, "{$1}"));

  return joinPath(...segments);
}

function extractNextAppRouterRoutes(sourceFile: SourceFile, relativePath: string): RouteHandler[] {
  const routePath = nextAppRouterPathFromFile(relativePath);
  if (!routePath) return [];

  const routes: RouteHandler[] = [];
  for (const [name, decl] of sourceFile.getExportedDeclarations()) {
    if (!NEXT_HANDLER_EXPORTS.has(name)) continue;
    const fn = decl[0];
    if (!fn) continue;

    let handler: FunctionLikeDeclaration | undefined;
    if (Node.isFunctionDeclaration(fn)) handler = fn;
    else if (Node.isVariableDeclaration(fn)) {
      const init = fn.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) handler = init;
    }
    if (!handler) continue;

    routes.push({
      framework: "nextjs",
      httpMethod: name,
      path: routePath,
      handler,
      filePath: "",
      line: handler.getStartLineNumber(),
      observedGuards: [],
    });
  }

  return routes;
}

/**
 * Registers a Next.js `page.tsx`/`page.ts` default-exported Server Component
 * as a pseudo-route (`httpMethod: "PAGE"`) so rules that need a "reachable
 * from an HTTP request" entry point — like SENTINEL-INJ-003, since pages
 * receive `searchParams` directly as props — can analyze it the same way as
 * a Route Handler.
 */
function extractNextPageComponents(sourceFile: SourceFile, relativePath: string): RouteHandler[] {
  if (!/(^|\/)app\/(.*)\/page\.[tj]sx?$/.test(relativePath.replace(/\\/g, "/"))) return [];
  const routePath = nextAppRouterPathFromFile(relativePath.replace(/\/page\./, "/route."));

  const defaultExport = sourceFile.getDefaultExportSymbol();
  const decl = defaultExport?.getDeclarations()?.[0];
  let handler: FunctionLikeDeclaration | undefined;
  if (decl && Node.isFunctionDeclaration(decl)) handler = decl;
  else if (decl && Node.isVariableDeclaration(decl)) {
    const init = decl.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) handler = init;
  }
  if (!handler) return [];

  return [
    {
      framework: "nextjs",
      httpMethod: "PAGE",
      path: routePath ?? "/",
      handler,
      filePath: relativePath,
      line: handler.getStartLineNumber(),
      observedGuards: [],
    },
  ];
}

export function extractRouteHandlers(sourceFile: SourceFile, relativePath: string): RouteHandler[] {
  return [
    ...extractExpressRoutes(sourceFile).map((r) => ({ ...r, filePath: relativePath })),
    ...extractNestRoutes(sourceFile).map((r) => ({ ...r, filePath: relativePath })),
    ...extractNextPageComponents(sourceFile, relativePath),
    ...extractNextAppRouterRoutes(sourceFile, relativePath).map((r) => ({
      ...r,
      filePath: relativePath,
    })),
  ];
}
