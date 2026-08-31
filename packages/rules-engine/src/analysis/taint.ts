import { Node, SyntaxKind, type CallExpression, type Expression } from "ts-morph";
import type { TraceStep } from "../engine/types";
import type { FunctionLikeDeclaration } from "./ast-types";
import { functionDisplayName, functionKey, resolveCallTargetDeclaration } from "./symbols";
import { isSourceExpression, type SourceMatch } from "./sources";
import { matchSink, type SinkMatch } from "./sinks";
import {
  matchTransform,
  matchUnaryNumericCoercion,
  neutralizesFor,
  type TransformKind,
} from "./transforms";

export interface TaintOrigin {
  source: SourceMatch;
  filePath: string;
  line: number;
  expressionText: string;
}

export interface TaintedBinding {
  origin: TaintOrigin;
  appliedTransforms: TransformKind[];
  trace: TraceStep[];
}

export interface TaintFlow {
  functionDisplayName: string;
  /**
   * The sink node — a `CallExpression` for every sink category except
   * `html_output`, where it's the `dangerouslySetInnerHTML` JSX attribute
   * itself (JSX attributes aren't call expressions). Narrow with
   * `Node.isCallExpression` before calling call-expression-only members.
   */
  call: Node;
  sink: SinkMatch;
  /** Property path within the sink's arguments where the tainted value was found (e.g. ["where", "id"]), empty when the tainted value is a top-level argument. */
  taintedPaths: Array<{ path: string[]; binding: TaintedBinding }>;
  filePath: string;
  line: number;
}

interface TaintContext {
  taintedVars: Map<string, TaintedBinding>;
  /** Identifiers whose *any* property access is tainted — used for Next.js destructured `{ params }`/`{ searchParams }`. */
  taintedObjects: Map<string, SourceMatch>;
}

const MAX_INTERPROCEDURAL_DEPTH = 4;
const MAX_NODES_VISITED = 20_000;

function makeOriginTrace(origin: TaintOrigin): TraceStep {
  return {
    role: "source",
    description: `Untrusted input from ${origin.source.description}`,
    filePath: origin.filePath,
    line: origin.line,
    snippet: origin.expressionText,
  };
}

function bindingFromSource(source: SourceMatch, expr: Expression): TaintedBinding {
  const origin: TaintOrigin = {
    source,
    filePath: expr.getSourceFile().getFilePath(),
    line: expr.getStartLineNumber(),
    expressionText: expr.getText(),
  };
  return { origin, appliedTransforms: [], trace: [makeOriginTrace(origin)] };
}

function taintedObjectAccess(expr: Expression, ctx: TaintContext): SourceMatch | undefined {
  if (!Node.isPropertyAccessExpression(expr) && !Node.isElementAccessExpression(expr))
    return undefined;
  const receiver = expr.getExpression();
  if (Node.isIdentifier(receiver)) return ctx.taintedObjects.get(receiver.getText());
  return undefined;
}

class FunctionAnalyzer {
  constructor(
    private readonly visiting: Set<string>,
    private readonly nodeBudget: { remaining: number },
  ) {}

  /** Bottom-up: resolves whether an expression carries taint, and if so, from where and through what transforms. */
  resolveExpressionTaint(
    expr: Expression,
    ctx: TaintContext,
    depth: number,
  ): TaintedBinding | undefined {
    if (
      Node.isParenthesizedExpression(expr) ||
      Node.isAsExpression(expr) ||
      Node.isNonNullExpression(expr)
    ) {
      return this.resolveExpressionTaint(expr.getExpression(), ctx, depth);
    }

    const directSource = isSourceExpression(expr) ?? taintedObjectAccess(expr, ctx);
    if (directSource) return bindingFromSource(directSource, expr);

    if (Node.isIdentifier(expr)) {
      return ctx.taintedVars.get(expr.getText());
    }

    if (matchUnaryNumericCoercion(expr) && Node.isPrefixUnaryExpression(expr)) {
      const inner = this.resolveExpressionTaint(expr.getOperand(), ctx, depth);
      if (!inner) return undefined;
      return { ...inner, appliedTransforms: [...inner.appliedTransforms, "numeric_coercion"] };
    }

    if (Node.isTemplateExpression(expr)) {
      for (const span of expr.getTemplateSpans()) {
        const spanBinding = this.resolveExpressionTaint(span.getExpression(), ctx, depth);
        if (spanBinding) return spanBinding;
      }
      return undefined;
    }

    if (
      Node.isBinaryExpression(expr) &&
      expr.getOperatorToken().getKind() === SyntaxKind.PlusToken
    ) {
      return (
        this.resolveExpressionTaint(expr.getLeft(), ctx, depth) ??
        this.resolveExpressionTaint(expr.getRight(), ctx, depth)
      );
    }

    if (Node.isCallExpression(expr)) {
      return this.resolveCallTaint(expr, ctx, depth);
    }

    return undefined;
  }

  private resolveCallTaint(
    call: CallExpression,
    ctx: TaintContext,
    depth: number,
  ): TaintedBinding | undefined {
    const transform = matchTransform(call);
    if (transform) {
      const [firstArg] = call.getArguments();
      if (!firstArg || !Node.isExpression(firstArg)) return undefined;
      const argBinding = this.resolveExpressionTaint(firstArg, ctx, depth);
      if (!argBinding) return undefined;
      return {
        origin: argBinding.origin,
        appliedTransforms: [...argBinding.appliedTransforms, transform.kind],
        trace: [
          ...argBinding.trace,
          {
            role: transform.kind === "format_validation" ? "validator" : "sanitizer",
            description: transform.description,
            filePath: call.getSourceFile().getFilePath(),
            line: call.getStartLineNumber(),
            snippet: call.getText(),
          },
        ],
      };
    }

    if (depth <= 0) return undefined;
    const args = call.getArguments().filter(Node.isExpression);
    if (args.length === 0) return undefined;

    const targetFn = resolveCallTargetDeclaration(call);
    if (!targetFn) return undefined;

    const key = functionKey(targetFn);
    if (this.visiting.has(key)) return undefined; // recursion guard

    const params = targetFn.getParameters();
    const calleeCtx: TaintContext = { taintedVars: new Map(), taintedObjects: new Map() };
    let anyArgTainted = false;
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const argExpr = args[i];
      if (!param || !argExpr) continue;
      const argBinding = this.resolveExpressionTaint(argExpr, ctx, depth);
      if (argBinding) {
        anyArgTainted = true;
        calleeCtx.taintedVars.set(param.getName(), {
          ...argBinding,
          trace: [
            ...argBinding.trace,
            {
              role: "propagation",
              description: `Passed as \`${param.getName()}\` into ${functionDisplayName(targetFn)}(...)`,
              filePath: call.getSourceFile().getFilePath(),
              line: call.getStartLineNumber(),
              snippet: call.getText(),
            },
          ],
        });
      }
    }
    if (!anyArgTainted) return undefined;

    this.visiting.add(key);
    const result = this.analyzeFunctionBody(targetFn, calleeCtx, depth - 1);
    this.visiting.delete(key);
    return result.returnTaint;
  }

  /** Top-down: walks a function body, propagating taint through declarations/assignments and collecting any flows into sinks (including inside statically-resolvable callees). */
  analyzeFunctionBody(
    fn: FunctionLikeDeclaration,
    ctx: TaintContext,
    depth: number,
  ): { flows: TaintFlow[]; returnTaint?: TaintedBinding } {
    const flows: TaintFlow[] = [];
    let returnTaint: TaintedBinding | undefined;
    const body = fn.getBody();
    if (!body) return { flows };

    body.forEachDescendant((node, traversal) => {
      if (this.nodeBudget.remaining-- <= 0) {
        traversal.stop();
        return;
      }

      if (Node.isVariableDeclaration(node)) {
        const init = node.getInitializer();
        if (!init) return;
        const nameNode = node.getNameNode();
        if (Node.isIdentifier(nameNode)) {
          const binding = this.resolveExpressionTaint(init, ctx, depth);
          if (binding) ctx.taintedVars.set(nameNode.getText(), binding);
        } else if (Node.isObjectBindingPattern(nameNode)) {
          this.seedDestructuring(nameNode, init, ctx, depth);
        }
        return;
      }

      if (
        Node.isBinaryExpression(node) &&
        node.getOperatorToken().getKind() === SyntaxKind.EqualsToken
      ) {
        const left = node.getLeft();
        if (Node.isIdentifier(left)) {
          const binding = this.resolveExpressionTaint(node.getRight(), ctx, depth);
          if (binding) ctx.taintedVars.set(left.getText(), binding);
        }
        return;
      }

      if (Node.isReturnStatement(node)) {
        const expr = node.getExpression();
        if (expr) {
          const binding = this.resolveExpressionTaint(expr, ctx, depth);
          if (binding) returnTaint = binding;
        }
        return;
      }

      if (Node.isCallExpression(node)) {
        const sink = matchSink(node);
        if (sink) {
          const taintedPaths = findTaintedLeaves(
            node.getArguments().filter(Node.isExpression),
            ctx,
            this,
            depth,
          );
          if (taintedPaths.length > 0) {
            flows.push({
              functionDisplayName: functionDisplayName(fn),
              call: node,
              sink,
              taintedPaths,
              filePath: node.getSourceFile().getFilePath(),
              line: node.getStartLineNumber(),
            });
          }
          return;
        }

        // Interprocedural: recurse into resolvable callees to find sinks nested inside them,
        // even when the call's own return value isn't used (e.g. a service method that queries
        // and responds internally rather than returning a value up the chain).
        if (depth > 0 && !matchTransform(node)) {
          const targetFn = resolveCallTargetDeclaration(node);
          if (targetFn) {
            const key = functionKey(targetFn);
            if (!this.visiting.has(key)) {
              const args = node.getArguments().filter(Node.isExpression);
              const params = targetFn.getParameters();
              const calleeCtx: TaintContext = { taintedVars: new Map(), taintedObjects: new Map() };
              for (let i = 0; i < params.length; i++) {
                const param = params[i];
                const argExpr = args[i];
                if (!param || !argExpr) continue;
                const binding = this.resolveExpressionTaint(argExpr, ctx, depth);
                if (binding) {
                  calleeCtx.taintedVars.set(param.getName(), {
                    ...binding,
                    trace: [
                      ...binding.trace,
                      {
                        role: "propagation",
                        description: `Passed as \`${param.getName()}\` into ${functionDisplayName(targetFn)}(...)`,
                        filePath: node.getSourceFile().getFilePath(),
                        line: node.getStartLineNumber(),
                        snippet: node.getText(),
                      },
                    ],
                  });
                }
              }
              if (calleeCtx.taintedVars.size > 0) {
                this.visiting.add(key);
                const nested = this.analyzeFunctionBody(targetFn, calleeCtx, depth - 1);
                this.visiting.delete(key);
                flows.push(...nested.flows);
              }
            }
          }
        }
        return;
      }

      if (Node.isJsxAttribute(node) && node.getNameNode().getText() === "dangerouslySetInnerHTML") {
        const initializer = node.getInitializer();
        const expr = Node.isJsxExpression(initializer) ? initializer.getExpression() : undefined;
        if (expr && Node.isObjectLiteralExpression(expr)) {
          const htmlProp = expr.getProperty("__html");
          const htmlValue =
            htmlProp && Node.isPropertyAssignment(htmlProp) ? htmlProp.getInitializer() : undefined;
          if (htmlValue) {
            const binding = this.resolveExpressionTaint(htmlValue, ctx, depth);
            if (binding) {
              flows.push({
                functionDisplayName: functionDisplayName(fn),
                call: node,
                sink: { category: "html_output", api: "dangerouslySetInnerHTML" },
                taintedPaths: [{ path: ["__html"], binding }],
                filePath: node.getSourceFile().getFilePath(),
                line: node.getStartLineNumber(),
              });
            }
          }
        }
      }
    });

    return { flows, returnTaint };
  }

  private seedDestructuring(
    pattern: import("ts-morph").ObjectBindingPattern,
    init: Expression,
    ctx: TaintContext,
    depth: number,
  ): void {
    const initBinding = this.resolveExpressionTaint(init, ctx, depth);
    for (const element of pattern.getElements()) {
      const propName = element.getPropertyNameNode()?.getText() ?? element.getName();
      if (initBinding) {
        ctx.taintedVars.set(element.getName(), {
          ...initBinding,
          trace: [
            ...initBinding.trace,
            {
              role: "propagation",
              description: `Destructured \`${propName}\` from tainted value`,
              filePath: element.getSourceFile().getFilePath(),
              line: element.getStartLineNumber(),
            },
          ],
        });
      }
    }
  }
}

/**
 * Recursively finds tainted leaf expressions within a list of call
 * arguments, descending into object/array literals so that
 * `prisma.account.findUnique({ where: { id: req.params.id } })` reports the
 * taint at path `["where", "id"]` rather than only at the whole-argument
 * level — the Authorization Analyzer needs the path to inspect sibling
 * properties (ownership predicates) at the same nesting level.
 */
export function findTaintedLeaves(
  args: Expression[],
  ctx: { taintedVars: Map<string, TaintedBinding>; taintedObjects: Map<string, SourceMatch> },
  analyzer: FunctionAnalyzer,
  depth: number,
): Array<{ path: string[]; binding: TaintedBinding }> {
  const results: Array<{ path: string[]; binding: TaintedBinding }> = [];

  function walk(expr: Expression, path: string[]): void {
    if (Node.isObjectLiteralExpression(expr)) {
      for (const prop of expr.getProperties()) {
        if (Node.isPropertyAssignment(prop)) {
          const init = prop.getInitializer();
          if (init) walk(init, [...path, prop.getName()]);
        } else if (Node.isShorthandPropertyAssignment(prop)) {
          const binding = analyzer.resolveExpressionTaint(prop.getNameNode(), ctx, depth);
          if (binding) results.push({ path: [...path, prop.getName()], binding });
        }
      }
      return;
    }
    if (Node.isArrayLiteralExpression(expr)) {
      for (const element of expr.getElements()) {
        if (Node.isExpression(element)) walk(element, path);
      }
      return;
    }
    const binding = analyzer.resolveExpressionTaint(expr, ctx, depth);
    if (binding) results.push({ path, binding });
  }

  for (const arg of args) {
    if (Node.isExpression(arg)) walk(arg, []);
  }
  return results;
}

/**
 * Entry point: analyzes a route handler for taint flows reaching any
 * registered sink, seeding taint objects for Next.js's destructured
 * `{ params }`/`{ searchParams }` handler argument and scalar taint for
 * NestJS's `@Param()`/`@Query()`/`@Body()`/`@Headers()` decorated
 * parameters. Express handlers need no seeding — `req.params.x` is matched
 * inline wherever it's referenced.
 */
export function analyzeHandlerForTaintFlows(fn: FunctionLikeDeclaration): TaintFlow[] {
  const ctx: TaintContext = { taintedVars: new Map(), taintedObjects: new Map() };
  seedNestDecoratedParams(fn, ctx);
  seedNextRouteContextParam(fn, ctx);

  const analyzer = new FunctionAnalyzer(new Set([functionKey(fn)]), {
    remaining: MAX_NODES_VISITED,
  });
  return analyzer.analyzeFunctionBody(fn, ctx, MAX_INTERPROCEDURAL_DEPTH).flows;
}

const NEST_PARAM_DECORATORS: Record<string, SourceMatch["kind"]> = {
  Param: "http.params",
  Query: "http.query",
  Body: "http.body",
  Headers: "http.headers",
};

const NEST_PARAM_DESCRIPTIONS: Record<SourceMatch["kind"], string> = {
  "http.params": "route parameter",
  "http.query": "query string",
  "http.body": "request body",
  "http.headers": "request headers",
  "http.cookies": "cookies",
  "http.raw_request": "raw request",
  "env.var": "environment variable",
};

function seedNestDecoratedParams(fn: FunctionLikeDeclaration, ctx: TaintContext): void {
  if (!Node.isMethodDeclaration(fn)) return;
  for (const param of fn.getParameters()) {
    for (const [decoratorName, kind] of Object.entries(NEST_PARAM_DECORATORS)) {
      const decorator = param.getDecorator(decoratorName);
      if (!decorator) continue;
      const nameNode = param.getNameNode();
      if (!Node.isIdentifier(nameNode)) continue;
      const description = NEST_PARAM_DESCRIPTIONS[kind];
      ctx.taintedVars.set(nameNode.getText(), {
        origin: {
          source: { kind, description: `@${decoratorName}() ${description}` },
          filePath: fn.getSourceFile().getFilePath(),
          line: param.getStartLineNumber(),
          expressionText: param.getText(),
        },
        appliedTransforms: [],
        trace: [
          {
            role: "source",
            description: `Untrusted input from @${decoratorName}() ${description}`,
            filePath: fn.getSourceFile().getFilePath(),
            line: param.getStartLineNumber(),
            snippet: param.getText(),
          },
        ],
      });
    }
  }
}

/**
 * Seeds Next.js's destructured route-context object, whichever position it
 * appears in: Route Handlers take it as the second argument
 * (`(request, { params }) => ...`), while page/layout Server Components
 * take it as their only argument (`({ params, searchParams }) => ...`).
 */
function seedNextRouteContextParam(fn: FunctionLikeDeclaration, ctx: TaintContext): void {
  for (const contextParam of fn.getParameters()) {
    const nameNode = contextParam.getNameNode();
    if (!Node.isObjectBindingPattern(nameNode)) continue;

    for (const element of nameNode.getElements()) {
      const propName = element.getPropertyNameNode()?.getText() ?? element.getName();
      if (propName === "params")
        ctx.taintedObjects.set(element.getName(), {
          kind: "http.params",
          description: "Next.js route params",
        });
      if (propName === "searchParams")
        ctx.taintedObjects.set(element.getName(), {
          kind: "http.query",
          description: "Next.js route search params",
        });
    }
  }
}

export function neutralizesTaintFor(
  binding: TaintedBinding,
  sinkCategory: import("./sinks").SinkCategory,
): boolean {
  return binding.appliedTransforms.some((t) => neutralizesFor(t, sinkCategory));
}
