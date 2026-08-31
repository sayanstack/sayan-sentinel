import { Node, SyntaxKind, type Expression } from "ts-morph";
import { isSourceExpression } from "../../analysis/sources";
import { computeConfidence } from "../../findings/confidence";
import type { RuleContext } from "../../engine/RuleContext";
import type { RuleFinding, SentinelRule } from "../../engine/types";

const PRIVILEGE_FIELD_NAME =
  /^(role|isAdmin|is_admin|admin|permission|permissions|scope|scopes|privilege|isSuperuser|is_superuser)$/i;

function matchPrivilegeSource(
  expr: Expression,
): { propertyName: string; description: string } | undefined {
  if (!Node.isPropertyAccessExpression(expr)) return undefined;
  const propertyName = expr.getName();
  if (!PRIVILEGE_FIELD_NAME.test(propertyName)) return undefined;
  const source = isSourceExpression(expr);
  if (!source) return undefined;
  return { propertyName, description: source.description };
}

/**
 * Detects an authorization-relevant branch condition that reads its
 * privilege decision directly from client-controlled input (`req.body.role`,
 * `req.query.isAdmin`, a privilege header) rather than from a server-derived
 * session/claims object. This is deliberately narrow — only fields whose
 * name plausibly encodes a privilege decision, and only when referenced
 * inside a conditional — to avoid flagging every read of a request body.
 */
export const authzClientSuppliedPrivilegeDecision: SentinelRule = {
  id: "SENTINEL-AUTHZ-004",
  title: "Client-Supplied Privilege Decision",
  description:
    "A conditional branch bases an authorization decision on a field read directly from client-controlled input " +
    "(request body, query string, or headers) whose name suggests it encodes a privilege or role, rather than on a " +
    "server-derived session or claims object. A client can set this value to whatever it wants.",
  category: "authorization",
  severity: "high",
  cwe: "CWE-602",
  owasp: ["A01:2021 – Broken Access Control"],
  supportedLanguages: ["typescript", "javascript"],
  supportedFrameworks: ["express", "nestjs", "nextjs"],
  remediation:
    "Derive privilege/role decisions from a server-verified session or JWT claims object populated by your " +
    "authentication layer, never from a client-supplied request field. If the client needs to request a role change, " +
    "route it through a separate, authorized administrative action instead of trusting the value at request time.",
  analyze(context: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];

    for (const route of context.routes) {
      const body = route.handler.getBody();
      if (!body) continue;

      const seen = new Set<string>();
      for (const ifStatement of body.getDescendantsOfKind(SyntaxKind.IfStatement)) {
        const condition = ifStatement.getExpression();
        const candidates = [
          condition,
          ...condition.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression),
        ].filter(Node.isPropertyAccessExpression);

        for (const candidate of candidates) {
          const match = matchPrivilegeSource(candidate);
          if (!match) continue;

          const key = `${candidate.getStartLineNumber()}:${candidate.getText()}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const sourceFile = candidate.getSourceFile();
          const filePath = context.relativePath(sourceFile);
          const routeLabel = `${route.httpMethod} ${route.path}`;

          const confidence = computeConfidence([
            {
              label: "Field name matches a known privilege-decision pattern",
              weight: 20,
              present: true,
            },
            { label: "Referenced directly inside a conditional branch", weight: 5, present: true },
          ]);

          findings.push({
            ruleId: "SENTINEL-AUTHZ-004",
            title: "Client-Supplied Privilege Decision",
            description:
              `Route ${routeLabel} branches on \`${candidate.getText()}\`, a value read from ${match.description}, ` +
              `to make what looks like a privilege or role decision.`,
            category: "authorization",
            severity: "high",
            confidence: confidence.level,
            confidenceScore: confidence.score,
            cwe: "CWE-602",
            owasp: ["A01:2021 – Broken Access Control"],
            filePath,
            lineStart: candidate.getStartLineNumber(),
            lineEnd: candidate.getStartLineNumber(),
            route: routeLabel,
            reason:
              `Detected: conditional branch keyed on \`${candidate.getText()}\`, which originates from ${match.description}. ` +
              `Observed: no server-derived session/claims object involved in this comparison.`,
            evidence: [
              { label: "Route", detail: routeLabel },
              { label: "Condition", detail: ifStatement.getExpression().getText() },
              { label: "Client-controlled field", detail: candidate.getText() },
              { label: "Source", detail: match.description },
            ],
            trace: [
              {
                role: "source",
                description: `Untrusted input from ${match.description}`,
                filePath,
                line: candidate.getStartLineNumber(),
                snippet: candidate.getText(),
              },
              {
                role: "sink",
                description: "Used directly in an authorization-relevant conditional branch",
                filePath,
                line: ifStatement.getStartLineNumber(),
                snippet: ifStatement.getExpression().getText(),
              },
            ],
            remediation:
              "Derive this decision from a server-verified session/claims object, not from client-supplied request data.",
          });
        }
      }
    }

    return findings;
  },
};
