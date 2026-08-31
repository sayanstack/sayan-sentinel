import { Node } from "ts-morph";
import { nodeId } from "./ids";

/**
 * Finds the nearest enclosing function/method for `node` and returns the
 * same node id `extractDeclarations` would have registered for it, so
 * call-site/env-usage/query edges attribute back to the right function.
 * Returns undefined for module-scope (top-level) code.
 */
export function nearestScopeNodeId(node: Node, filePath: string): string | undefined {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (Node.isMethodDeclaration(current)) {
      return nodeId("method", filePath, current.getName(), current.getStartLineNumber());
    }
    if (Node.isFunctionDeclaration(current)) {
      const name = current.getName();
      if (name) {
        return nodeId("function", filePath, name, current.getStartLineNumber());
      }
    }
    if (Node.isArrowFunction(current) || Node.isFunctionExpression(current)) {
      const parent = current.getParent();
      if (parent && Node.isVariableDeclaration(parent)) {
        return nodeId("function", filePath, parent.getName(), current.getStartLineNumber());
      }
    }
    current = current.getParent();
  }
  return undefined;
}
