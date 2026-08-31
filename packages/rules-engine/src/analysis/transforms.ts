import { Node, SyntaxKind, type CallExpression, type Expression } from "ts-morph";
import type { SinkCategory } from "./sinks";

/**
 * A transform records what happened to a tainted value on its way to a
 * sink. Whether a transform actually clears taint is *sink-category
 * specific* — `Number(id)` makes SQL/command injection impossible (a number
 * cannot contain shell metacharacters) but proves nothing about
 * authorization (a numeric ID is still user-controlled and still needs an
 * ownership check). See `neutralizesFor` below; this is the direct
 * implementation of the spec's sanitizer-vs-validator distinction.
 */
export type TransformKind =
  "numeric_coercion" | "string_coercion" | "format_validation" | "html_escape" | "path_normalize";

export interface TransformMatch {
  kind: TransformKind;
  description: string;
}

const NUMERIC_COERCION_FNS = new Set(["Number", "parseInt", "parseFloat", "BigInt"]);
const HTML_ESCAPE_FNS = new Set(["escapeHtml", "encodeHTMLEntities", "sanitize"]);
const PATH_NORMALIZE_FNS = new Set(["normalize", "basename"]);

/** Matches a call expression that transforms (but does not gate) a value on its way to a sink. */
export function matchTransform(call: CallExpression): TransformMatch | undefined {
  const expr = call.getExpression();

  if (Node.isIdentifier(expr)) {
    const name = expr.getText();
    if (NUMERIC_COERCION_FNS.has(name)) {
      return { kind: "numeric_coercion", description: `${name}() coerces the value to a number` };
    }
  }

  if (Node.isPropertyAccessExpression(expr)) {
    const method = expr.getName();
    const receiver = expr.getExpression().getText();

    // Zod's tainted value enters at `.parse(value)`/`.safeParse(value)`, at the *end* of the
    // schema chain (`z.string().uuid().parse(value)`) — not at the `.uuid()`/`.email()` calls
    // themselves, which take no value argument at all and only shape the schema.
    if ((method === "parse" || method === "safeParse") && /^z(od)?\b/.test(receiver)) {
      return {
        kind: "format_validation",
        description: "Zod schema .parse() validates format only — not ownership",
      };
    }
    if (HTML_ESCAPE_FNS.has(method) || (method === "sanitize" && /DOMPurify/i.test(receiver))) {
      return {
        kind: "html_escape",
        description: `${receiver}.${method}() escapes HTML-significant characters`,
      };
    }
    if (PATH_NORMALIZE_FNS.has(method) && /^path$/.test(receiver)) {
      return {
        kind: "path_normalize",
        description: `path.${method}() normalizes the path but does not enforce root containment`,
      };
    }
  }

  return undefined;
}

export function matchUnaryNumericCoercion(expr: Expression): boolean {
  return Node.isPrefixUnaryExpression(expr) && expr.getOperatorToken() === SyntaxKind.PlusToken;
}

/**
 * Whether an applied transform neutralizes taint *for this specific sink
 * category*. `format_validation` and `path_normalize` deliberately never
 * neutralize anything here: a UUID-shaped string is still an arbitrary
 * resource identifier, and `path.normalize` alone does not prove
 * containment within an allowed root (that requires an explicit
 * containment check, which Sentinel does not infer from `normalize()` alone).
 */
export function neutralizesFor(transform: TransformKind, sinkCategory: SinkCategory): boolean {
  switch (transform) {
    case "numeric_coercion":
      return sinkCategory === "command_execution" || sinkCategory === "database";
    case "html_escape":
      return sinkCategory === "html_output";
    case "string_coercion":
    case "format_validation":
    case "path_normalize":
      return false;
    default:
      return false;
  }
}

const AUTHORIZATION_GUARD_NAME =
  /^(is|has|check|assert|require|ensure|verify|can)([A-Z][A-Za-z]*)?(Owner|Ownership|Access|Permission|Authorized|Authorization|Tenant|Role|Allowed)/;
const AUTHENTICATION_ONLY_NAME =
  /^(is|require|ensure|check)(LoggedIn|Authenticated|SignedIn|Session)$/i;

/**
 * Name-based heuristic for "this call is an authorization decision", e.g.
 * `isOwner(...)`, `assertOwnership(...)`, `checkTenantAccess(...)`,
 * `can(user, "read", resource)`. Deliberately excludes pure-authentication
 * checks (`isAuthenticated`) — proving *who* the caller is says nothing
 * about whether they may access *this* resource, which is the distinction
 * AUTHZ-001 depends on.
 */
export function isAuthorizationGuardCall(call: CallExpression): boolean {
  const expr = call.getExpression();
  const name = Node.isPropertyAccessExpression(expr) ? expr.getName() : expr.getText();
  if (AUTHENTICATION_ONLY_NAME.test(name)) return false;
  if (name === "can" || name === "authorize") return true;
  return AUTHORIZATION_GUARD_NAME.test(name);
}

const OWNERSHIP_PROPERTY_NAME =
  /^(owner|user|tenant|organization|org|account|customer)(Id)?$|^createdBy$/i;

/** Whether an object-literal property name plausibly scopes a query to a specific owner/tenant. */
export function isOwnershipPropertyName(propertyName: string): boolean {
  return OWNERSHIP_PROPERTY_NAME.test(propertyName);
}

const SESSION_DERIVED_PATTERN =
  /\b(session|currentUser|current_user|ctx\.user|req\.user|request\.user|auth\.user|authUser)\b/i;

/** Whether an expression's text looks derived from the authenticated session rather than client input. */
export function isSessionDerivedExpression(expr: Expression): boolean {
  return SESSION_DERIVED_PATTERN.test(expr.getText());
}
