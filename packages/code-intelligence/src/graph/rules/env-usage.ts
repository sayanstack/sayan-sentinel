import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import { edgeId, nodeId, syntheticNodeId } from "../ids";
import { nearestScopeNodeId } from "../scope";
import type { CodeGraphBuilderContext } from "../types";

function isProcessEnv(expr: Node): boolean {
  if (!Node.isPropertyAccessExpression(expr)) return false;
  return expr.getExpression().getText() === "process" && expr.getName() === "env";
}

/** Detects `process.env.FOO` and `process.env["FOO"]` reads. */
export function extractEnvUsage(
  ctx: CodeGraphBuilderContext,
  sourceFile: SourceFile,
  filePath: string,
): void {
  const fileNodeId = nodeId("file", filePath, filePath, 0);

  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (!isProcessEnv(access.getExpression())) continue;
    registerEnvRead(ctx, access.getName(), access, filePath, fileNodeId);
  }

  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    if (!isProcessEnv(access.getExpression())) continue;
    const argExpr = access.getArgumentExpression();
    if (!argExpr || !Node.isStringLiteral(argExpr)) continue;
    registerEnvRead(ctx, argExpr.getLiteralValue(), access, filePath, fileNodeId);
  }
}

function registerEnvRead(
  ctx: CodeGraphBuilderContext,
  varName: string,
  siteNode: Node,
  filePath: string,
  fileNodeId: string,
): void {
  const envNodeId = syntheticNodeId("env_var", varName);
  ctx.addNode({
    id: envNodeId,
    kind: "env_var",
    filePath: "",
    name: varName,
    lineStart: 0,
    lineEnd: 0,
  });

  const scopeId = nearestScopeNodeId(siteNode, filePath) ?? fileNodeId;
  ctx.addEdge({
    id: edgeId("READS_FROM", scopeId, envNodeId),
    kind: "READS_FROM",
    fromNodeId: scopeId,
    toNodeId: envNodeId,
    metadata: { line: siteNode.getStartLineNumber() },
  });
}
