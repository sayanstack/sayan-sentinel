import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import { edgeId, nodeId, syntheticNodeId } from "../ids";
import { nearestScopeNodeId } from "../scope";
import type { CodeGraphBuilderContext } from "../types";

const EXTERNAL_CALL_PATTERNS: Array<{ test: RegExp; client: (calleeText: string) => string }> = [
  { test: /^fetch$/, client: () => "fetch" },
  { test: /^axios(\.(get|post|put|delete|patch|request))?$/, client: () => "axios" },
  { test: /^(http|https)\.(get|request)$/, client: (t) => t.split(".")[0] ?? t },
  { test: /^got(\.(get|post|put|delete|patch))?$/, client: () => "got" },
];

/** Detects outbound HTTP calls: `fetch(...)`, `axios.get(...)`, `http.request(...)`, `got(...)`. */
export function extractExternalCalls(
  ctx: CodeGraphBuilderContext,
  sourceFile: SourceFile,
  filePath: string,
): void {
  const fileNodeId = nodeId("file", filePath, filePath, 0);

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const calleeText = call.getExpression().getText();
    const pattern = EXTERNAL_CALL_PATTERNS.find((p) => p.test.test(calleeText));
    if (!pattern) continue;

    const client = pattern.client(calleeText);
    const line = call.getStartLineNumber();
    const [urlArg] = call.getArguments();
    const url = urlArg && Node.isStringLiteral(urlArg) ? urlArg.getLiteralValue() : undefined;

    const endpointKey = url ?? `${client}:${filePath}:${line}`;
    const endpointNodeId = syntheticNodeId("external_endpoint", endpointKey);
    ctx.addNode({
      id: endpointNodeId,
      kind: "external_endpoint",
      filePath: "",
      name: url ?? `${client} call (dynamic URL)`,
      lineStart: 0,
      lineEnd: 0,
      metadata: { client },
    });

    const scopeId = nearestScopeNodeId(call, filePath) ?? fileNodeId;
    ctx.addEdge({
      id: edgeId("CALLS_EXTERNAL", scopeId, endpointNodeId),
      kind: "CALLS_EXTERNAL",
      fromNodeId: scopeId,
      toNodeId: endpointNodeId,
      metadata: { line, client },
    });
  }
}
