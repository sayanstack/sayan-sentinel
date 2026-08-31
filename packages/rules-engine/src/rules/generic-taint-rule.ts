import type { Severity } from "@sayan-sentinel/shared";
import {
  analyzeHandlerForTaintFlows,
  neutralizesTaintFor,
  type TaintedBinding,
  type TaintFlow,
} from "../analysis/taint";
import type { SinkCategory } from "../analysis/sinks";
import type { RouteHandler } from "../analysis/routes";
import { computeConfidence, type ConfidenceSignal } from "../findings/confidence";
import { buildTraceWithSink } from "../findings/evidence";
import type { RuleContext } from "../engine/RuleContext";
import type {
  RuleCategory,
  RuleEvidence,
  RuleFinding,
  SentinelRule,
  SupportedFramework,
} from "../engine/types";

export interface TaintSinkRuleOptions {
  id: string;
  title: string;
  description: string;
  category: RuleCategory;
  severity: Severity;
  cwe?: string;
  owasp?: string[];
  remediation: string;
  supportedFrameworks?: readonly SupportedFramework[];
  sinkCategory: SinkCategory;
  findingTitle: string;
  buildReason: (flow: TaintFlow, leaf: { path: string[]; binding: TaintedBinding }) => string;
  extraEvidence?: (
    flow: TaintFlow,
    leaf: { path: string[]; binding: TaintedBinding },
  ) => RuleEvidence[];
  extraConfidenceSignals?: (
    flow: TaintFlow,
    leaf: { path: string[]; binding: TaintedBinding },
    route: RouteHandler,
  ) => ConfidenceSignal[];
}

/**
 * Factory for rules whose shape is "a tainted value reaches this sink
 * category with no neutralizing transform observed" — the common pattern
 * behind command injection, path traversal, SSRF, raw-query injection, and
 * XSS. Each of those differs only in which sink category to watch and how
 * to phrase the evidence, not in the underlying taint-flow logic, so
 * factoring it out here keeps the per-rule files focused on the security
 * reasoning rather than re-implementing traversal.
 */
export function createTaintSinkRule(options: TaintSinkRuleOptions): SentinelRule {
  return {
    id: options.id,
    title: options.title,
    description: options.description,
    category: options.category,
    severity: options.severity,
    cwe: options.cwe,
    owasp: options.owasp,
    supportedLanguages: ["typescript", "javascript"],
    supportedFrameworks: options.supportedFrameworks ?? ["express", "nestjs", "nextjs"],
    remediation: options.remediation,
    analyze(context: RuleContext): RuleFinding[] {
      const findings: RuleFinding[] = [];

      for (const route of context.routes) {
        const flows = analyzeHandlerForTaintFlows(route.handler).filter(
          (f) => f.sink.category === options.sinkCategory,
        );

        for (const flow of flows) {
          for (const leaf of flow.taintedPaths) {
            if (neutralizesTaintFor(leaf.binding, options.sinkCategory)) continue;

            const filePath = context.relativePath(flow.call.getSourceFile());
            const routeLabel = `${route.httpMethod} ${route.path}`;

            const confidence = computeConfidence([
              {
                label: "Tainted value reaches sink with no neutralizing transform observed",
                weight: 25,
                present: true,
              },
              ...(options.extraConfidenceSignals?.(flow, leaf, route) ?? []),
            ]);

            findings.push({
              ruleId: options.id,
              title: options.findingTitle,
              description: options.description,
              category: options.category,
              severity: options.severity,
              confidence: confidence.level,
              confidenceScore: confidence.score,
              cwe: options.cwe,
              owasp: options.owasp,
              filePath,
              lineStart: flow.line,
              lineEnd: flow.line,
              symbol: flow.functionDisplayName,
              route: routeLabel,
              reason: options.buildReason(flow, leaf),
              evidence: [
                { label: "Route", detail: routeLabel },
                { label: "Sink", detail: flow.sink.api },
                { label: "Source", detail: leaf.binding.origin.expressionText },
                {
                  label: "Applied transforms",
                  detail:
                    leaf.binding.appliedTransforms.length > 0
                      ? leaf.binding.appliedTransforms.join(", ")
                      : "None observed",
                },
                ...(options.extraEvidence?.(flow, leaf) ?? []),
              ],
              trace: buildTraceWithSink(leaf.binding, flow.call, `${flow.sink.api}(...)`),
              remediation: options.remediation,
            });
          }
        }
      }

      return findings;
    },
  };
}
