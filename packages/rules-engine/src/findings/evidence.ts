import type { Node } from "ts-morph";
import type { TraceStep } from "../engine/types";
import type { TaintedBinding } from "../analysis/taint";

/** Appends the final sink step to a tainted binding's accumulated trace, producing the full source-to-sink trace for a finding. */
export function buildTraceWithSink(
  binding: TaintedBinding,
  sinkCall: Node,
  sinkDescription: string,
): TraceStep[] {
  return [
    ...binding.trace,
    {
      role: "sink",
      description: sinkDescription,
      filePath: sinkCall.getSourceFile().getFilePath(),
      line: sinkCall.getStartLineNumber(),
      snippet: sinkCall.getText(),
    },
  ];
}

export function formatTraceForText(trace: TraceStep[]): string {
  return trace
    .map(
      (step, i) => `${i + 1}. [${step.role}] ${step.description} (${step.filePath}:${step.line})`,
    )
    .join("\n");
}
