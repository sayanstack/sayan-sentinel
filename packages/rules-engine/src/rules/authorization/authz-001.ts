import { analyzeAuthorization } from "../../analysis/authorization";
import { computeConfidence } from "../../findings/confidence";
import { buildTraceWithSink } from "../../findings/evidence";
import type { RuleContext } from "../../engine/RuleContext";
import type { RuleFinding, SentinelRule } from "../../engine/types";

/**
 * The flagship rule: traces a user-controlled resource identifier through
 * route handler -> (optionally) service/repository layers -> a single-record
 * database lookup, and reports when neither an ownership/tenant predicate
 * in the query nor a dominating authorization guard was observed before the
 * result is returned to the client. This is the "own engine" the project's
 * positioning depends on — Semgrep/Gitleaks/OSV integration only requires
 * running someone else's tool; this requires actually understanding the
 * request -> controller -> service -> repository -> DB -> response flow.
 */
export const authzMissingOwnershipConstraint: SentinelRule = {
  id: "SENTINEL-AUTHZ-001",
  title: "User-Controlled Resource Access Without Ownership Constraint",
  description:
    "A route accepts a user-controlled resource identifier (path parameter, query string, or body field) and uses it directly in a single-record database lookup, with no observable ownership/tenant predicate in the query and no observable authorization guard dominating the lookup, and the result is returned to the client. This is the static signature of Broken Object-Level Authorization (BOLA) / Insecure Direct Object Reference (IDOR): an authenticated (or unauthenticated) caller can potentially substitute another user's identifier and receive that user's data.",
  category: "authorization",
  severity: "high",
  cwe: "CWE-639",
  owasp: ["A01:2021 – Broken Access Control"],
  supportedLanguages: ["typescript", "javascript"],
  supportedFrameworks: ["express", "nestjs", "nextjs"],
  remediation:
    "Bind the resource lookup to the authenticated subject or tenant — e.g. add `ownerId: session.user.id` (or the tenant-scoped equivalent) to the query's `where` clause so the row can only be found if it belongs to the caller, or verify ownership with an authorization guard (`assertOwnership(...)`, a NestJS `Guard`, or equivalent) before the lookup executes. A format validator alone (`z.string().uuid()`, `Number(id)`) does not establish ownership and will not clear this finding.",
  analyze(context: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];

    for (const route of context.routes) {
      for (const result of analyzeAuthorization(route)) {
        // Either signal means the access is guarded — not a finding.
        if (result.ownershipPredicate || result.dominatingGuard) continue;
        // Not observably exposed to the client — avoid overclaiming exploitability.
        if (!result.reachesResponse) continue;

        const sourceFile = result.flow.call.getSourceFile();
        const filePath = context.relativePath(sourceFile);
        const routeLabel = `${route.httpMethod} ${route.path}`;
        const predicatePath = result.taintedLeaf.path.join(".") || "(top-level argument)";

        const confidence = computeConfidence([
          {
            label: "Model name matches a security-sensitive resource pattern",
            weight: 15,
            present: result.sensitiveModel,
          },
          {
            label: "Handler has an observed authentication/authorization guard",
            weight: 10,
            present: route.observedGuards.length > 0,
          },
          {
            label: "Direct single-record lookup keyed by the user-controlled identifier",
            weight: 20,
            present: true,
          },
          {
            label: "Query result is observably returned to the client",
            weight: 15,
            present: result.reachesResponse,
          },
        ]);

        findings.push({
          ruleId: "SENTINEL-AUTHZ-001",
          title: "Potential Broken Object-Level Authorization (BOLA/IDOR)",
          description:
            `Route ${routeLabel} looks up a ${result.flow.sink.api} record filtered only by \`${predicatePath}\`, ` +
            `a value that originates from ${result.taintedLeaf.binding.origin.source.description}. No ownership/tenant ` +
            `constraint or authorization guard was observed between the request and the lookup, and the result is ` +
            `returned to the client.`,
          category: "authorization",
          severity: result.sensitiveModel ? "high" : "medium",
          confidence: confidence.level,
          confidenceScore: confidence.score,
          cwe: "CWE-639",
          owasp: ["A01:2021 – Broken Access Control"],
          filePath,
          lineStart: result.flow.line,
          lineEnd: result.flow.line,
          symbol: result.flow.functionDisplayName,
          route: routeLabel,
          reason:
            `Detected: user-controlled resource identifier reaches ${result.flow.sink.api}(...) filtered only by ` +
            `\`${predicatePath}\`. Observed: no ownership/tenant predicate in the query, no authorization guard ` +
            `dominating the lookup. No observable control found before the result reaches the response.`,
          evidence: [
            { label: "Route", detail: routeLabel },
            {
              label: "Resource identifier source",
              detail: result.taintedLeaf.binding.origin.expressionText,
            },
            { label: "Database operation", detail: result.flow.sink.api },
            {
              label: "Query predicate observed",
              detail: `\`${predicatePath}\` only — no ownership/tenant field`,
            },
            {
              label: "Authentication",
              detail:
                route.observedGuards.length > 0
                  ? `Guard(s) observed on handler: ${route.observedGuards.join(", ")}`
                  : "No authentication guard observed on this handler (may be enforced by middleware Sentinel did not statically resolve)",
            },
            {
              label: "Authorization",
              detail: "No ownership/tenant predicate or authorization guard observed",
            },
            {
              label: "Applied value transforms",
              detail:
                result.taintedLeaf.binding.appliedTransforms.length > 0
                  ? result.taintedLeaf.binding.appliedTransforms.join(", ") +
                    " — format/type coercion, not an authorization control"
                  : "None observed",
            },
          ],
          trace: buildTraceWithSink(
            result.taintedLeaf.binding,
            result.flow.call,
            `${result.flow.sink.api}(...) — record returned to the client without an ownership/tenant constraint`,
          ),
          remediation:
            "Bind the resource lookup to the authenticated subject or tenant (e.g. add `ownerId: session.user.id` " +
            "to the query's `where` clause), or verify ownership with an authorization guard before the lookup executes.",
        });
      }
    }

    return findings;
  },
};
