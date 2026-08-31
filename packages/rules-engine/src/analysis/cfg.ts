import { Node, SyntaxKind, type Expression, type Statement } from "ts-morph";
import { isAuthorizationGuardCall } from "./transforms";

export interface GuardCondition {
  /** The raw boolean expression that gates control flow (may be a `!x` negation, `x && y`, etc.). */
  condition: Expression;
  /** True when `condition` must evaluate truthy for control to reach the node being analyzed. */
  requiredTruthiness: boolean;
}

/** True when a statement always exits its enclosing function (return/throw), including through nested blocks and exhaustive if/else. */
function isTerminating(stmt: Statement): boolean {
  if (Node.isReturnStatement(stmt) || Node.isThrowStatement(stmt)) return true;
  if (Node.isBlock(stmt)) {
    const statements = stmt.getStatements();
    const last = statements[statements.length - 1];
    return last !== undefined && isTerminating(last);
  }
  if (Node.isIfStatement(stmt)) {
    const elseStatement = stmt.getElseStatement();
    if (!elseStatement) return false;
    return isTerminating(stmt.getThenStatement()) && isTerminating(elseStatement);
  }
  return false;
}

/**
 * Walks up from `target` to the enclosing function, collecting every boolean
 * condition that must hold (in the given truthiness) for control to reach
 * `target`. Handles two patterns:
 *
 *  1. Direct nesting — `target` is inside an `if (cond) { target }` "then"
 *     branch (requires `cond` truthy) or an `else` branch (requires `cond`
 *     falsy).
 *  2. Early-return guards — `if (cond) { return/throw; }` followed by
 *     `target` as a later sibling statement in the same block (requires
 *     `cond` falsy, since a truthy `cond` would have exited already). This
 *     is the dominant pattern in Express/NestJS handlers:
 *     `if (!isOwner) return res.status(403).end(); db.findUnique(...)`.
 *
 * This is intentionally not a full control-flow graph — it is exactly
 * enough to distinguish "a guard dominates this sink" from "no guard
 * observed", which is what the Authorization Analyzer needs.
 */
export function precedingGuardConditions(target: Node): GuardCondition[] {
  const guards: GuardCondition[] = [];
  let current: Node = target;

  while (true) {
    const parent = current.getParent();
    if (!parent) break;

    if (Node.isIfStatement(parent)) {
      const condition = parent.getExpression();
      if (parent.getThenStatement() === current) {
        guards.push({ condition, requiredTruthiness: true });
      } else if (parent.getElseStatement() === current) {
        guards.push({ condition, requiredTruthiness: false });
      }
    }

    if (Node.isBlock(parent) || Node.isSourceFile(parent)) {
      const statements = parent.getStatements();
      const index = statements.findIndex((s) => s === current);
      if (index > 0) {
        for (let i = 0; i < index; i++) {
          const stmt = statements[i];
          if (
            Node.isIfStatement(stmt) &&
            !stmt.getElseStatement() &&
            isTerminating(stmt.getThenStatement())
          ) {
            guards.push({ condition: stmt.getExpression(), requiredTruthiness: false });
          }
        }
      }
    }

    if (
      Node.isFunctionDeclaration(parent) ||
      Node.isArrowFunction(parent) ||
      Node.isFunctionExpression(parent) ||
      Node.isMethodDeclaration(parent)
    ) {
      break;
    }

    current = parent;
  }

  return guards;
}

/** Unwraps a leading `!` so guard-name matching sees the underlying call regardless of negation. */
function unwrapNegation(expr: Expression): { expr: Expression; negated: boolean } {
  if (
    Node.isPrefixUnaryExpression(expr) &&
    expr.getOperatorToken() === SyntaxKind.ExclamationToken
  ) {
    return { expr: expr.getOperand(), negated: true };
  }
  return { expr, negated: false };
}

export interface DominatingGuard {
  guard: GuardCondition;
  guardCallText: string;
}

/**
 * Whether an authorization-guard call (per `isAuthorizationGuardCall`)
 * dominates `target` — i.e., appears among its preceding guard conditions
 * with the truthiness that actually gates access (an `isOwner(...)` guard
 * only counts if reaching `target` requires it to be true; `!isOwner(...)`
 * early-return guards also count, since after unwrapping the negation the
 * required truthiness of the inner call is still "true").
 */
export function findDominatingAuthorizationGuard(target: Node): DominatingGuard | undefined {
  for (const guard of precedingGuardConditions(target)) {
    const { expr, negated } = unwrapNegation(guard.condition);
    if (!Node.isCallExpression(expr)) continue;
    if (!isAuthorizationGuardCall(expr)) continue;

    // The call must be required *truthy* to reach `target`, after accounting for negation.
    const effectiveRequiredTruthiness = negated
      ? !guard.requiredTruthiness
      : guard.requiredTruthiness;
    if (effectiveRequiredTruthiness) {
      return { guard, guardCallText: expr.getText() };
    }
  }
  return undefined;
}
