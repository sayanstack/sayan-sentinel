import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import { edgeId, nodeId, syntheticNodeId } from "../ids";
import { nearestScopeNodeId } from "../scope";
import type { CodeGraphBuilderContext } from "../types";

const PRISMA_WRITE_VERBS = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);
const PRISMA_READ_VERBS = new Set(["findMany", "findUnique", "findFirst", "count", "aggregate", "groupBy"]);
const PRISMA_VERBS = new Set([...PRISMA_READ_VERBS, ...PRISMA_WRITE_VERBS]);

/** Detects Prisma-style `prisma.<model>.<verb>(...)` (and `this.prisma....`) database access. */
export function extractDbQueries(ctx: CodeGraphBuilderContext, sourceFile: SourceFile, filePath: string): void {
  const fileNodeId = nodeId("file", filePath, filePath, 0);

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) continue;

    const verb = expr.getName();
    if (!PRISMA_VERBS.has(verb)) continue;

    const modelExpr = expr.getExpression();
    if (!Node.isPropertyAccessExpression(modelExpr)) continue;

    const model = modelExpr.getName();
    const receiverText = modelExpr.getExpression().getText();
    if (!/prisma/i.test(receiverText)) continue;

    const line = call.getStartLineNumber();
    const modelNodeId = syntheticNodeId("db_model", model);
    ctx.addNode({ id: modelNodeId, kind: "db_model", filePath: "", name: model, lineStart: 0, lineEnd: 0 });

    const scopeId = nearestScopeNodeId(call, filePath) ?? fileNodeId;
    const isWrite = PRISMA_WRITE_VERBS.has(verb);

    ctx.addEdge({
      id: edgeId("QUERIES", scopeId, modelNodeId),
      kind: "QUERIES",
      fromNodeId: scopeId,
      toNodeId: modelNodeId,
      metadata: { verb, operation: isWrite ? "write" : "read", line },
    });

    ctx.addEdge({
      id: edgeId(isWrite ? "WRITES_TO" : "READS_FROM", scopeId, modelNodeId),
      kind: isWrite ? "WRITES_TO" : "READS_FROM",
      fromNodeId: scopeId,
      toNodeId: modelNodeId,
      metadata: { verb, line },
    });
  }
}
