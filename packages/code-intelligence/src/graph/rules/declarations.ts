import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import { edgeId, nodeId } from "../ids";
import type { CodeGraphBuilderContext } from "../types";

/** Registers function, class, and method nodes — the base symbols every other rule attributes activity back to. */
export function extractDeclarations(
  ctx: CodeGraphBuilderContext,
  sourceFile: SourceFile,
  filePath: string,
): void {
  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    ctx.addNode({
      id: nodeId("function", filePath, name, fn.getStartLineNumber()),
      kind: "function",
      filePath,
      name,
      lineStart: fn.getStartLineNumber(),
      lineEnd: fn.getEndLineNumber(),
    });
  }

  for (const varDecl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const initializer = varDecl.getInitializer();
    if (!initializer) continue;
    if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) {
      const name = varDecl.getName();
      ctx.addNode({
        id: nodeId("function", filePath, name, initializer.getStartLineNumber()),
        kind: "function",
        filePath,
        name,
        lineStart: initializer.getStartLineNumber(),
        lineEnd: initializer.getEndLineNumber(),
      });
    }
  }

  for (const cls of sourceFile.getClasses()) {
    const className = cls.getName() ?? "<anonymous>";
    const classNode = ctx.addNode({
      id: nodeId("class", filePath, className, cls.getStartLineNumber()),
      kind: "class",
      filePath,
      name: className,
      lineStart: cls.getStartLineNumber(),
      lineEnd: cls.getEndLineNumber(),
    });

    for (const method of cls.getMethods()) {
      const methodName = method.getName();
      const methodNode = ctx.addNode({
        id: nodeId("method", filePath, methodName, method.getStartLineNumber()),
        kind: "method",
        filePath,
        name: `${className}.${methodName}`,
        lineStart: method.getStartLineNumber(),
        lineEnd: method.getEndLineNumber(),
      });
      ctx.addEdge({
        id: edgeId("DEPENDS_ON", methodNode.id, classNode.id),
        kind: "DEPENDS_ON",
        fromNodeId: methodNode.id,
        toNodeId: classNode.id,
      });
    }
  }
}
