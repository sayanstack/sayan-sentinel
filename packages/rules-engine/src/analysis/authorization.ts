import { Node, SyntaxKind, type CallExpression, type Expression } from "ts-morph";
import type { FunctionLikeDeclaration } from "./ast-types";
import { findDominatingAuthorizationGuard, type DominatingGuard } from "./cfg";
import type { RouteHandler } from "./routes";
import { isSensitiveModel, matchSink } from "./sinks";
import { analyzeHandlerForTaintFlows, type TaintedBinding, type TaintFlow } from "./taint";
import { isOwnershipPropertyName, isSessionDerivedExpression } from "./transforms";

export interface OwnershipPredicateDetail {
  propertyName: string;
  valueText: string;
}

export interface AuthorizationFinding {
  route: RouteHandler;
  flow: TaintFlow;
  taintedLeaf: { path: string[]; binding: TaintedBinding };
  ownershipPredicate?: OwnershipPredicateDetail;
  dominatingGuard?: DominatingGuard;
  reachesResponse: boolean;
  sensitiveModel: boolean;
}

function findObjectLiteralAtPath(
  args: Expression[],
  path: string[],
): import("ts-morph").ObjectLiteralExpression | undefined {
  let current: Expression | undefined = args[0];
  for (const segment of path.slice(0, -1)) {
    if (!current || !Node.isObjectLiteralExpression(current)) return undefined;
    const prop = current.getProperty(segment);
    if (!prop || !Node.isPropertyAssignment(prop)) return undefined;
    current = prop.getInitializer();
  }
  return current && Node.isObjectLiteralExpression(current) ? current : undefined;
}

function findOwnershipPredicate(
  container: import("ts-morph").ObjectLiteralExpression,
): OwnershipPredicateDetail | undefined {
  for (const prop of container.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    if (!isOwnershipPropertyName(prop.getName())) continue;
    const init = prop.getInitializer();
    if (init && isSessionDerivedExpression(init)) {
      return { propertyName: prop.getName(), valueText: init.getText() };
    }
  }
  return undefined;
}

/**
 * Approximates whether a sink call's result reaches an HTTP response:
 * direct `return prisma.x.findUnique(...)` / `return res.json(await ...)`,
 * or a variable assigned from the call that is later returned or passed to
 * a response sink. This is textual-reference matching, not full alias
 * analysis — a value renamed through an intermediate wrapper function
 * before reaching the response would not be detected, which is a documented
 * limitation rather than a silent gap. It is also intentionally loose in one
 * direction: when the sink lives inside a callee reached interprocedurally
 * (e.g. `AccountService.getAccount`), a bare `return prisma...findUnique(...)`
 * inside that callee counts as "reaches a response" without confirming the
 * *caller* actually forwards the value to the client — verifying that would
 * require tracing the call chain forward rather than just checking the
 * immediate return, which V1 does not do. This can only produce a
 * false-positive-leaning result, never hide a real exposure.
 */
function reachesResponse(call: CallExpression, fn: FunctionLikeDeclaration): boolean {
  const body = fn.getBody();
  if (!body) return false;

  let node: Node = call;
  for (let i = 0; i < 3; i++) {
    const parent = node.getParent();
    if (!parent) break;
    if (Node.isReturnStatement(parent)) return true;
    if (Node.isCallExpression(parent) && matchSink(parent)?.category === "sensitive_response")
      return true;
    if (Node.isAwaitExpression(parent) || Node.isParenthesizedExpression(parent)) {
      node = parent;
      continue;
    }
    break;
  }

  const declParent = node.getParent();
  if (!declParent || !Node.isVariableDeclaration(declParent)) return false;
  const nameNode = declParent.getNameNode();
  if (!Node.isIdentifier(nameNode)) return false;
  const varName = nameNode.getText();

  return body.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => {
    if (id === nameNode || id.getText() !== varName) return false;
    const parent = id.getParent();
    if (Node.isReturnStatement(parent)) return true;
    const callAncestor = id.getFirstAncestor((a) => Node.isCallExpression(a));
    return (
      !!callAncestor &&
      Node.isCallExpression(callAncestor) &&
      matchSink(callAncestor)?.category === "sensitive_response"
    );
  });
}

function findEnclosingFunction(node: Node): FunctionLikeDeclaration | undefined {
  return node.getFirstAncestor(
    (n) =>
      Node.isFunctionDeclaration(n) ||
      Node.isMethodDeclaration(n) ||
      Node.isArrowFunction(n) ||
      Node.isFunctionExpression(n),
  ) as FunctionLikeDeclaration | undefined;
}

/**
 * Finds an authorization guard dominating either the query call itself, or
 * — the "fetch first, then check, then use" pattern — the point where the
 * query's result is eventually returned or handed to a response sink,
 * inside its *own* enclosing function. The second case matters because some
 * authorization checks are structurally impossible to run before the fetch
 * (e.g. verifying `resource.tenantId` against the caller's memberships
 * requires having read `resource` first); gating the eventual use rather
 * than the fetch is a legitimate, safe pattern, not a bypass. This only
 * looks within the function that contains the sink call — a guard in a
 * *different* function up the call chain (e.g. the controller that invoked
 * this service method) is not considered, since confirming it actually
 * covers this code path would require the same forward-tracing
 * `reachesResponse` already documents as unimplemented.
 */
function findGuardProtectingQueryOrItsReturn(call: CallExpression): DominatingGuard | undefined {
  const direct = findDominatingAuthorizationGuard(call);
  if (direct) return direct;

  const fn = findEnclosingFunction(call);
  const body = fn?.getBody();
  if (!fn || !body) return undefined;

  const parent = call.getParent();
  const declParent = parent && Node.isAwaitExpression(parent) ? parent.getParent() : parent;
  if (!declParent || !Node.isVariableDeclaration(declParent)) return undefined;
  const nameNode = declParent.getNameNode();
  if (!Node.isIdentifier(nameNode)) return undefined;
  const varName = nameNode.getText();

  for (const returnStatement of body.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
    if (returnStatement.getExpression()?.getText() !== varName) continue;
    const guard = findDominatingAuthorizationGuard(returnStatement);
    if (guard) return guard;
  }

  for (const identifier of body.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (identifier === nameNode || identifier.getText() !== varName) continue;
    const sinkCall = identifier.getFirstAncestor((a) => Node.isCallExpression(a));
    if (!sinkCall || !Node.isCallExpression(sinkCall)) continue;
    if (matchSink(sinkCall)?.category !== "sensitive_response") continue;
    const guard = findDominatingAuthorizationGuard(sinkCall);
    if (guard) return guard;
  }

  return undefined;
}

/**
 * The Authorization Analyzer: runs the taint engine restricted to
 * single-record database lookups (Prisma `findUnique`/`findFirst`/`update`/
 * `delete`), then for each user-controlled identifier reaching one,
 * evaluates the two independent authorization signals AUTHZ-001 depends on
 * — an ownership/tenant predicate in the same query object, or a CFG-
 * dominating authorization-guard call — plus whether the result is
 * observably returned to the client and whether the model looks
 * security-sensitive. It does not decide severity/confidence itself; that's
 * the rule's job, using this as evidence.
 */
export function analyzeAuthorization(route: RouteHandler): AuthorizationFinding[] {
  const flows = analyzeHandlerForTaintFlows(route.handler).filter(
    (f) => f.sink.category === "database" && f.sink.isSingleRecordLookup,
  );

  const results: AuthorizationFinding[] = [];
  for (const flow of flows) {
    // Database-category sinks are always CallExpressions (matchSink only ever matches Prisma
    // call shapes for this category) — html_output is the only sink kind whose node isn't one.
    if (!Node.isCallExpression(flow.call)) continue;
    const call = flow.call;

    const args = call.getArguments().filter(Node.isExpression);
    for (const leaf of flow.taintedPaths) {
      const container = findObjectLiteralAtPath(args, leaf.path);
      const ownershipPredicate = container ? findOwnershipPredicate(container) : undefined;
      const dominatingGuard = findGuardProtectingQueryOrItsReturn(call);
      const modelMatch = flow.sink.api.match(/^prisma\.(\w+)\./);

      results.push({
        route,
        flow,
        taintedLeaf: leaf,
        ownershipPredicate,
        dominatingGuard,
        reachesResponse: reachesResponse(call, route.handler),
        sensitiveModel: modelMatch?.[1] ? isSensitiveModel(modelMatch[1]) : false,
      });
    }
  }
  return results;
}
