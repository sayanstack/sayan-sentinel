import { Node, type CallExpression } from "ts-morph";
import type { FunctionLikeDeclaration } from "./ast-types";

/**
 * Resolves a declaration node to the function body Sentinel can actually
 * analyze (an arrow function, function expression, function declaration, or
 * class method) — unwrapping `const fn = () => {}` / `field = () => {}`
 * initializers along the way. Returns `undefined` when the declaration
 * doesn't carry executable code (e.g. a type-only declaration, an
 * ambient/overload signature, or a re-export), which callers treat as an
 * *unresolved* edge rather than inventing one.
 */
function toFunctionLike(decl: Node | undefined): FunctionLikeDeclaration | undefined {
  if (!decl) return undefined;
  if (
    Node.isFunctionDeclaration(decl) ||
    Node.isMethodDeclaration(decl) ||
    Node.isArrowFunction(decl) ||
    Node.isFunctionExpression(decl)
  ) {
    return decl.getBody() ? decl : undefined;
  }
  if (Node.isVariableDeclaration(decl) || Node.isPropertyDeclaration(decl)) {
    const init = decl.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return init;
  }
  return undefined;
}

/**
 * Resolves an identifier or property-access reference to the function/method
 * it points at, using the TypeScript language service's own symbol
 * resolution rather than name matching. This is what lets Sentinel follow
 * `this.accountService.getAccount(id)` to the actual `getAccount` method —
 * the "controller -> service -> repository" chain the Authorization
 * Analyzer depends on.
 */
export function resolveReferenceDeclaration(reference: Node): FunctionLikeDeclaration | undefined {
  const nameNode = Node.isPropertyAccessExpression(reference) ? reference.getNameNode() : reference;
  const symbol = nameNode.getSymbol();
  const declarations = symbol?.getDeclarations() ?? [];
  for (const decl of declarations) {
    const fn = toFunctionLike(decl);
    if (fn) return fn;
  }
  return undefined;
}

/**
 * Resolves the callee of a call expression to a statically-known function
 * body within the project, when possible. Only resolves calls whose target
 * the type checker can bind unambiguously (no dynamic dispatch through
 * interfaces with multiple implementations, no computed member access) —
 * anything else is left unresolved, which the call graph records explicitly
 * (see `graph/CallGraph.ts`) rather than guessing.
 */
export function resolveCallTargetDeclaration(
  call: CallExpression,
): FunctionLikeDeclaration | undefined {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr) || Node.isPropertyAccessExpression(expr)) {
    return resolveReferenceDeclaration(expr);
  }
  return undefined;
}

/** Stable identity key for a function-like declaration, used to key maps/sets across the analysis. */
export function functionKey(fn: FunctionLikeDeclaration): string {
  const sourceFile = fn.getSourceFile();
  return `${sourceFile.getFilePath()}#${fn.getStartLineNumber()}:${fn.getStart()}`;
}

/** Best-effort human-readable name for a function-like declaration, for evidence/trace text. */
export function functionDisplayName(fn: FunctionLikeDeclaration): string {
  if (Node.isMethodDeclaration(fn)) {
    const parent = fn.getParent();
    const className = Node.isClassDeclaration(parent) ? parent.getName() : undefined;
    return className ? `${className}.${fn.getName()}` : fn.getName();
  }
  if (Node.isFunctionDeclaration(fn)) return fn.getName() ?? "<anonymous function>";
  const varDecl = fn.getParent();
  if (Node.isVariableDeclaration(varDecl)) return varDecl.getName();
  const propDecl = fn.getParent();
  if (Node.isPropertyDeclaration(propDecl)) {
    const cls = propDecl.getParent();
    const className = Node.isClassDeclaration(cls) ? cls.getName() : undefined;
    return className ? `${className}.${propDecl.getName()}` : propDecl.getName();
  }
  return "<anonymous function>";
}
