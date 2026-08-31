import type {
  ArrowFunction,
  FunctionDeclaration,
  FunctionExpression,
  MethodDeclaration,
} from "ts-morph";

/**
 * ts-morph's own `FunctionLikeDeclaration` is a mixin *trait* interface
 * (extends `JSDocableNode`/`SignaturedDeclaration`/etc, not `Node`) — it
 * deliberately doesn't carry `.getBody()`/`.getSourceFile()`/`.getParent()`.
 * This package needs an actual concrete-node union with those members, so
 * it defines its own instead of fighting the mixin type everywhere it's used.
 */
export type FunctionLikeDeclaration =
  FunctionDeclaration | MethodDeclaration | ArrowFunction | FunctionExpression;
