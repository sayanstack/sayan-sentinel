import { Node, SyntaxKind, type Expression } from "ts-morph";
import { matchSink } from "../../analysis/sinks";
import { computeConfidence } from "../../findings/confidence";
import type { RuleContext } from "../../engine/RuleContext";
import type { RuleFinding, SentinelRule } from "../../engine/types";

const SENSITIVE_FIELD_NAME =
  /^(password|passwordHash|password_hash|secret|token|refreshToken|refresh_token|resetToken|reset_token|apiKey|api_key|privateKey|private_key)$/i;

interface SensitiveFieldReference {
  propertyName: string;
  node: Node;
}

function findSensitiveFieldReferences(expr: Expression): SensitiveFieldReference[] {
  const results: SensitiveFieldReference[] = [];

  function walk(e: Expression): void {
    if (!Node.isObjectLiteralExpression(e)) return;
    for (const prop of e.getProperties()) {
      if (Node.isPropertyAssignment(prop)) {
        if (SENSITIVE_FIELD_NAME.test(prop.getName())) {
          results.push({ propertyName: prop.getName(), node: prop });
        }
        const init = prop.getInitializer();
        if (init && Node.isExpression(init)) walk(init);
      } else if (
        Node.isShorthandPropertyAssignment(prop) &&
        SENSITIVE_FIELD_NAME.test(prop.getName())
      ) {
        results.push({ propertyName: prop.getName(), node: prop });
      }
    }
  }

  walk(expr);
  return results;
}

/**
 * Flags a response payload that explicitly names a sensitive field
 * (password, token, API key, ...) as one of its properties — e.g.
 * `res.json({ id: user.id, password: user.password })` or a Prisma `select`
 * clause naming `passwordHash` whose result flows straight to the response.
 * Deliberately scoped to explicit object-literal property names rather than
 * "any Prisma query with no `select` clause", since flagging every
 * unprojected query would require knowing the actual schema and would be
 * far noisier than the evidence actually supports.
 */
export const dataSensitiveFieldExposure: SentinelRule = {
  id: "SENTINEL-DATA-001",
  title: "Sensitive Data Exposure via API Response",
  description:
    "A response payload explicitly includes a field whose name indicates it holds a credential or secret " +
    "(password, token, API key, ...), returning it to the client.",
  category: "data-exposure",
  severity: "high",
  cwe: "CWE-213",
  owasp: ["A02:2021 – Cryptographic Failures"],
  supportedLanguages: ["typescript", "javascript"],
  supportedFrameworks: ["express", "nestjs", "nextjs"],
  remediation:
    "Use an explicit projection (Prisma `select`, a response DTO/serializer, or manual field mapping) that lists only " +
    "the fields the client is meant to see, rather than returning the full record or object.",
  analyze(context: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];

    for (const route of context.routes) {
      const body = route.handler.getBody();
      if (!body) continue;

      for (const call of body.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const sink = matchSink(call);
        if (sink?.category !== "sensitive_response") continue;

        for (const arg of call.getArguments()) {
          if (!Node.isExpression(arg)) continue;
          for (const reference of findSensitiveFieldReferences(arg)) {
            const filePath = context.relativePath(call.getSourceFile());
            const routeLabel = `${route.httpMethod} ${route.path}`;
            const confidence = computeConfidence([
              {
                label: "Field name explicitly matches a known credential/secret pattern",
                weight: 30,
                present: true,
              },
              { label: "Directly present in a response-sink argument", weight: 15, present: true },
            ]);

            findings.push({
              ruleId: "SENTINEL-DATA-001",
              title: "Sensitive Data Exposure via API Response",
              description: `Route ${routeLabel} returns a field named \`${reference.propertyName}\` directly to the client.`,
              category: "data-exposure",
              severity: "high",
              confidence: confidence.level,
              confidenceScore: confidence.score,
              cwe: "CWE-213",
              owasp: ["A02:2021 – Cryptographic Failures"],
              filePath,
              lineStart: reference.node.getStartLineNumber(),
              lineEnd: reference.node.getStartLineNumber(),
              route: routeLabel,
              reason: `Detected: response payload for ${routeLabel} includes a field named \`${reference.propertyName}\`, which matches a known credential/secret naming pattern.`,
              evidence: [
                { label: "Route", detail: routeLabel },
                { label: "Sink", detail: sink.api },
                { label: "Field", detail: reference.propertyName },
                { label: "Location", detail: reference.node.getText() },
              ],
              trace: [
                {
                  role: "sink",
                  description: `Response payload includes \`${reference.propertyName}\``,
                  filePath,
                  line: reference.node.getStartLineNumber(),
                  snippet: reference.node.getText(),
                },
              ],
              remediation:
                "Use an explicit projection (Prisma `select`, a response DTO/serializer) that excludes this field.",
            });
          }
        }
      }
    }

    return findings;
  },
};
