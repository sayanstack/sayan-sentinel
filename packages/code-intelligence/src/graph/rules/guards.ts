import type { SourceFile } from "ts-morph";
import { edgeId, nodeId, syntheticNodeId } from "../ids";
import type { CodeGraphBuilderContext, EdgeKind } from "../types";

/**
 * Detects NestJS `@UseGuards(...)` on route handlers. A guard whose name
 * suggests identity verification (e.g. `JwtAuthGuard`) is modeled as
 * AUTHENTICATES; anything else (role/permission/ownership guards) as
 * AUTHORIZES. This is a naming heuristic, not a semantic guarantee — it's
 * meant to seed the code graph for a reviewer, not to certify correctness.
 */
export function extractGuards(ctx: CodeGraphBuilderContext, sourceFile: SourceFile, filePath: string): void {
  for (const cls of sourceFile.getClasses()) {
    for (const method of cls.getMethods()) {
      const decorator = method.getDecorator("UseGuards");
      if (!decorator) continue;

      const methodId = nodeId("method", filePath, method.getName(), method.getStartLineNumber());

      for (const arg of decorator.getArguments()) {
        const guardName = arg.getText();
        const guardNodeId = syntheticNodeId("guard", guardName);
        ctx.addNode({
          id: guardNodeId,
          kind: "guard",
          filePath: "",
          name: guardName,
          lineStart: 0,
          lineEnd: 0,
        });

        const edgeKind: EdgeKind =
          /auth/i.test(guardName) && !/(role|permission|scope|owner)/i.test(guardName)
            ? "AUTHENTICATES"
            : "AUTHORIZES";

        ctx.addEdge({
          id: edgeId(edgeKind, methodId, guardNodeId),
          kind: edgeKind,
          fromNodeId: methodId,
          toNodeId: guardNodeId,
        });
      }
    }
  }
}
