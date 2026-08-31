import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import { edgeId, nodeId } from "../ids";
import type { CodeGraphBuilderContext } from "../types";

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

/** Detects Express-style `app.get('/path', handler)` and NestJS `@Controller`/`@Get` route definitions. */
export function extractRoutes(
  ctx: CodeGraphBuilderContext,
  sourceFile: SourceFile,
  filePath: string,
): void {
  extractExpressRoutes(ctx, sourceFile, filePath);
  extractNestRoutes(ctx, sourceFile, filePath);
}

function extractExpressRoutes(
  ctx: CodeGraphBuilderContext,
  sourceFile: SourceFile,
  filePath: string,
): void {
  const fileNodeId = nodeId("file", filePath, filePath, 0);

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) continue;

    const methodName = expr.getName();
    if (!EXPRESS_METHODS.has(methodName)) continue;

    const receiverText = expr.getExpression().getText();
    if (!/^(app|router|server|api)\b/i.test(receiverText)) continue;

    const [pathArg] = call.getArguments();
    if (!pathArg || !Node.isStringLiteral(pathArg)) continue;

    const routePath = pathArg.getLiteralValue();
    const line = call.getStartLineNumber();
    const routeName = `${methodName.toUpperCase()} ${routePath}`;

    const routeNode = ctx.addNode({
      id: nodeId("route", filePath, routeName, line),
      kind: "route",
      filePath,
      name: routeName,
      lineStart: line,
      lineEnd: call.getEndLineNumber(),
      metadata: { framework: "express", httpMethod: methodName.toUpperCase(), path: routePath },
    });

    ctx.addEdge({
      id: edgeId("EXPOSES_ROUTE", fileNodeId, routeNode.id),
      kind: "EXPOSES_ROUTE",
      fromNodeId: fileNodeId,
      toNodeId: routeNode.id,
    });
  }
}

function extractNestRoutes(
  ctx: CodeGraphBuilderContext,
  sourceFile: SourceFile,
  filePath: string,
): void {
  for (const cls of sourceFile.getClasses()) {
    const controllerDecorator = cls.getDecorator("Controller");
    if (!controllerDecorator) continue;

    const [prefixArg] = controllerDecorator.getArguments();
    const prefix = prefixArg && Node.isStringLiteral(prefixArg) ? prefixArg.getLiteralValue() : "";

    for (const method of cls.getMethods()) {
      for (const [decoratorName, httpMethod] of Object.entries(NEST_METHOD_DECORATORS)) {
        const decorator = method.getDecorator(decoratorName);
        if (!decorator) continue;

        const [subPathArg] = decorator.getArguments();
        const subPath =
          subPathArg && Node.isStringLiteral(subPathArg) ? subPathArg.getLiteralValue() : "";
        const fullPath = `/${[prefix, subPath].filter(Boolean).join("/")}`.replace(/\/+/g, "/");
        const line = method.getStartLineNumber();
        const routeName = `${httpMethod} ${fullPath}`;

        const routeNode = ctx.addNode({
          id: nodeId("route", filePath, routeName, line),
          kind: "route",
          filePath,
          name: routeName,
          lineStart: line,
          lineEnd: method.getEndLineNumber(),
          metadata: { framework: "nestjs", httpMethod, path: fullPath, handler: method.getName() },
        });

        const methodNodeId = nodeId(
          "method",
          filePath,
          method.getName(),
          method.getStartLineNumber(),
        );
        ctx.addEdge({
          id: edgeId("EXPOSES_ROUTE", methodNodeId, routeNode.id),
          kind: "EXPOSES_ROUTE",
          fromNodeId: methodNodeId,
          toNodeId: routeNode.id,
        });
      }
    }
  }
}
