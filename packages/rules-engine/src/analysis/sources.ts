import { Node, type Expression } from "ts-morph";

export type SourceKind =
  | "http.params"
  | "http.query"
  | "http.body"
  | "http.headers"
  | "http.cookies"
  | "http.raw_request"
  | "env.var";

export interface SourceMatch {
  kind: SourceKind;
  /** Human-readable description used directly in evidence/trace text. */
  description: string;
}

const PARAM_LIKE = /^(params|param)$/;
const QUERY_LIKE = /^(query|searchParams)$/;
const BODY_LIKE = /^body$/;
const HEADER_LIKE = /^headers?$/;
const COOKIE_LIKE = /^cookies?$/;

/**
 * Matches an expression against the framework source catalog: Express
 * (`req.params`/`req.query`/`req.body`/`req.headers`/`req.cookies`),
 * NestJS (same shape via `@Req() req`, since NestJS's `req` object is the
 * underlying Express/Fastify request), and Next.js (`params`/`searchParams`
 * destructured from a route handler's arguments, `request.nextUrl.searchParams`,
 * `request.headers`, `cookies()`). Sources are not equally trusted — headers
 * and cookies are attacker-controlled but lower-signal for authorization
 * bypass than params/body, which rules may weight accordingly.
 */
export function matchSource(expr: Expression): SourceMatch | undefined {
  if (Node.isPropertyAccessExpression(expr)) {
    const propName = expr.getName();
    const receiver = expr.getExpression();
    const receiverText = receiver.getText();

    const looksLikeRequest = /\b(req|request)\b/i.test(receiverText);
    if (looksLikeRequest) {
      if (PARAM_LIKE.test(propName))
        return { kind: "http.params", description: "request path parameters" };
      if (QUERY_LIKE.test(propName))
        return { kind: "http.query", description: "request query string" };
      if (BODY_LIKE.test(propName)) return { kind: "http.body", description: "request body" };
      if (HEADER_LIKE.test(propName))
        return { kind: "http.headers", description: "request headers" };
      if (COOKIE_LIKE.test(propName))
        return { kind: "http.cookies", description: "request cookies" };
    }

    // Next.js: `request.nextUrl.searchParams`
    if (propName === "searchParams" && /nextUrl$/.test(receiverText)) {
      return { kind: "http.query", description: "Next.js request URL search params" };
    }
  }

  if (Node.isCallExpression(expr)) {
    const calleeText = expr.getExpression().getText();
    if (/^(request\.json|req\.json)$/.test(calleeText)) {
      return { kind: "http.body", description: "parsed Next.js request JSON body" };
    }
    if (calleeText === "cookies") {
      return { kind: "http.cookies", description: "Next.js server cookies() accessor" };
    }
    if (calleeText === "headers") {
      return { kind: "http.headers", description: "Next.js server headers() accessor" };
    }
  }

  if (Node.isIdentifier(expr)) {
    const name = expr.getText();
    if (name === "params" || name === "searchParams") {
      return {
        kind: name === "params" ? "http.params" : "http.query",
        description: `destructured Next.js route ${name}`,
      };
    }
  }

  return undefined;
}

/** True when `expr` is itself a source, or a direct property/index access into a matched source object. */
export function isSourceExpression(expr: Expression): SourceMatch | undefined {
  if (Node.isElementAccessExpression(expr) || Node.isPropertyAccessExpression(expr)) {
    const inner = expr.getExpression();
    const direct = matchSource(expr);
    if (direct) return direct;
    return matchSource(inner);
  }
  return matchSource(expr);
}
